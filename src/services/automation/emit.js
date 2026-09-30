import { requestContext } from "../../config/context.js";
import { ASSIGN_FIELD, LABEL_FIELD, RECORD_TYPE_TO_TABLE, STATUS_FIELD, TABLE_TO_RECORD_TYPE } from "./constants.js";
import { getActiveFlows, hasListenersForRecord } from "./flowStore.js";
import { fetchRowsByIds, fetchRowsByWhere, tableFor } from "./records.js";
import { logError, tenantDBForCompany } from "./runtime.js";
import { matchAndStart } from "./triggers.js";

// Entry points added (one line each) to existing services - plan section 12.
//
//   emitAutomationEvent(req, "record.created", { table, id, data })
//   emitAutomationEvent(req, "record.updated", { table, where, before, data })
//   emitAutomationEvent(req, "status.changed", { reference_table, reference_id, status_id, previous_status_id })
//   emitAutomationEvent(req, "contact.created", { id | ids, origin })        // specific events
//   const __before = await automationBefore(req, table, where)              // pre-read for updates
//
// Both never throw and never delay the caller: matching and runs happen on a
// short timer (AUTOMATION_EMIT_DELAY_MS, default 1500) after the service returns.

const DEDUPE_MS = 30 * 1000;
const BULK_THRESHOLD = 200;
const EMIT_DELAY_MS = Number(process.env.AUTOMATION_EMIT_DELAY_MS ?? 1500);
const recent = new Map();

const buildEmitContext = (reqOrCtx, payload) => {
  const src = reqOrCtx || {};
  const store = requestContext.getStore() || {};
  const company_masters_id = Number(
    src.company_masters_id ||
      store.companyId ||
      src.user?.companyId ||
      src.body?.company_masters_id ||
      payload?.company_masters_id ||
      payload?.data?.company_masters_id ||
      0
  );
  const automation = src.automation || null;
  return {
    tenantDB: src.tenantDB || store.tenantDB,
    company_masters_id,
    a_application_login_id: Number(
      src.a_application_login_id || src.user?.a_application_login_id || src.user?.id || store.a_application_login_id || 0
    ) || null,
    origin: payload?.origin || automation?.origin || "user",
    chain_depth: automation?.chain_depth || 0,
    parent_execution_id: automation?.execution_id || null,
    source_flow_ids: automation?.flow_ids || [],
  };
};

const parseData = (d) => {
  if (typeof d !== "string") return d || {};
  try {
    return JSON.parse(d);
  } catch {
    return {};
  }
};

const idsFrom = (payload) => {
  let ids = [];
  if (payload.ids) ids = [].concat(payload.ids);
  else if (payload.id) ids = [payload.id];
  else if (Array.isArray(payload.records)) ids = payload.records.map((r) => r?.id ?? r?.dataValues?.id);
  else if (payload.record?.id || payload.record?.dataValues?.id) ids = [payload.record.id ?? payload.record.dataValues.id];
  return ids.filter(Boolean);
};

// Columns that change on every write (auto timestamps) - never a real edit.
const VOLATILE_FIELDS = new Set(["modified_date", "modify_date", "s_timestemp", "update_Date_time", "updated_at", "miracle_update_date_time", "temp"]);

const changedFields = (before, after) => {
  if (!before || !after) return [];
  return Object.keys(after).filter(
    (k) => !VOLATILE_FIELDS.has(k) && k in before && String(before[k] ?? "") !== String(after[k] ?? "")
  );
};

/** Turn one raw emit into normalized events: [{ type, record_type, id, before?, data? }] */
const normalize = async (ctx, eventType, payload) => {
  const out = [];

  if (eventType === "record.created" || eventType === "record.updated") {
    const recordType = TABLE_TO_RECORD_TYPE[payload.table];
    if (!recordType) return out;
    const action = eventType === "record.created" ? "created" : "updated";
    if (action === "created") {
      for (const id of idsFrom(payload)) out.push({ type: `${recordType}.created`, record_type: recordType, table: payload.table, id });
      return out;
    }
    const data = parseData(payload.data);
    const beforeRows = payload.before || [];
    const ids = beforeRows.length ? beforeRows.map((r) => r.id) : idsFrom({ ...payload, id: parseData(payload.where)?.id });
    for (const id of [].concat(...ids.map((x) => [].concat(x)))) {
      const before = beforeRows.find((r) => Number(r.id) === Number(id)) || null;
      out.push({ type: `${recordType}.updated`, record_type: recordType, table: payload.table, id, before, data });
    }
    return out;
  }

  if (eventType === "status.changed") {
    const recordType = TABLE_TO_RECORD_TYPE[payload.reference_table];
    if (!recordType) return out;
    out.push({
      type: `${recordType}.status_changed`,
      record_type: recordType,
      // `payload.table` overrides the lookup table, same reason as the
      // specific-events branch below - form_builder submissions live in a
      // per-form table (fbs_<id>), not a table named payload.reference_table.
      table: payload.table,
      id: payload.reference_id,
      status: { from: payload.previous_status_id ?? null, to: payload.status_id ?? null },
    });
    return out;
  }

  // Specific events: "<record>.<action>"
  const [recordType] = String(eventType).split(".");
  const before = payload.before || [];
  if (payload.standalone) {
    // Event with no row of its own in the tenant DB (e.g. website forms are
    // stored in the master DB): the form data travels in `data`.
    out.push({ type: eventType, record_type: recordType, id: null, data: parseData(payload.data), contact_id: payload.contact_id || null });
    return out;
  }
  // `payload.table` overrides the record type's default table - needed for
  // form_builder submissions, which live in one table PER FORM (fbs_<id>),
  // not a single "form_builder_submissions" table.
  const table = payload.table || RECORD_TYPE_TO_TABLE[recordType];
  let ids = idsFrom(payload);
  if (!ids.length && payload.where && table) {
    // Caller could not return ids (e.g. Miracle bulk sync): look the rows up.
    ids = (await fetchRowsByWhere(ctx.tenantDB, table, payload.where)).map((r) => r.id);
  }
  for (const id of ids) {
    out.push({
      type: eventType,
      record_type: recordType,
      table,
      id,
      before: before.find?.((r) => Number(r.id) === Number(id)) || null,
      data: parseData(payload.data),
      extra: payload.extra || null,
    });
  }
  return out;
};

/** Add derived events (assigned / label / status) from an update's before/after. */
const deriveFromUpdate = (ev, after) => {
  const derived = [];
  if (!ev.before || !after) return derived;
  const changed = changedFields(ev.before, after);
  ev.changed_fields = changed;
  const rt = ev.record_type;
  if (ASSIGN_FIELD[rt] && changed.includes(ASSIGN_FIELD[rt])) derived.push({ ...ev, type: `${rt}.assigned` });
  if (LABEL_FIELD[rt] && changed.includes(LABEL_FIELD[rt])) derived.push({ ...ev, type: `${rt}.label` });
  // Soft delete: isDelete flips to 1
  if (changed.includes("isDelete") && Number(after.isDelete) === 1) derived.push({ ...ev, type: `${rt}.deleted` });
  if (STATUS_FIELD[rt] && changed.includes(STATUS_FIELD[rt])) {
    derived.push({
      ...ev,
      type: `${rt}.status_changed`,
      status: { from: ev.before[STATUS_FIELD[rt]], to: after[STATUS_FIELD[rt]] },
    });
  }
  return derived;
};

const isDuplicate = (ctx, ev, statusTo) => {
  const key = `${ctx.tenantDB?.config?.database}|${ctx.company_masters_id}|${ev.type}|${ev.id}|${statusTo ?? ""}`;
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
};

const dispatch = async (ctx, eventType, payload) => {
  const flows = await getActiveFlows(ctx.tenantDB, ctx.company_masters_id);
  if (!flows.length) return;

  const events = await normalize(ctx, eventType, payload);
  if (!events.length) return;
  // A bulk UI action (assign / label / status on hundreds of rows) must not
  // fan out into hundreds of messages: treat it like an import (13.4).
  if (events.length > BULK_THRESHOLD && ctx.origin === "user") ctx = { ...ctx, origin: "import" };

  // Load current rows once per (table, record type) - table is normally
  // fixed per record type, but form_builder submissions use one table PER
  // FORM (ev.table), so events are grouped by table, not just record type.
  const byTable = new Map();
  for (const ev of events) {
    const table = ev.table || tableFor(ev.record_type);
    if (!table) continue;
    const key = `${ev.record_type}\u0000${table}`;
    if (!byTable.has(key)) byTable.set(key, { table, ids: new Set() });
    byTable.get(key).ids.add(Number(ev.id));
  }
  const rows = new Map();
  for (const { table, ids } of byTable.values()) {
    for (const row of await fetchRowsByIds(ctx.tenantDB, table, [...ids]).catch(() => [])) {
      rows.set(`${table}:${row.id}`, row);
    }
  }

  // Standalone events may point at a contact: load it so {{contact.*}} works.
  for (const ev of events) {
    if (ev.contact_id) ev.contact = (await fetchRowsByIds(ctx.tenantDB, "contact_masters", [ev.contact_id]))[0] || null;
  }

  const all = [];
  for (const ev of events) {
    const evTable = ev.table || tableFor(ev.record_type);
    const record = rows.get(`${evTable}:${Number(ev.id)}`) || null;
    if (ev.type.endsWith(".updated") && ev.before) {
      // We know the old row: only real changes count, and each specific
      // change (assigned / label / status / deleted) becomes its own event.
      const derived = deriveFromUpdate(ev, record);
      if (!ev.changed_fields?.length) continue;
      all.push({ ...ev, record }, ...derived.map((d) => ({ ...d, record })));
    } else {
      all.push({ ...ev, record });
    }
  }

  for (const ev of all) {
    if (ev.type.endsWith(".status_changed") && isDuplicate(ctx, ev, ev.status?.to)) continue;
    const listening = flows.filter((f) => f.trigger_type === ev.type);
    if (!listening.length) continue;
    await matchAndStart(ctx, ev, listening);
  }
};

export const emitAutomationEvent = (reqOrCtx, eventType, payload = {}) => {
  try {
    // Generic create / update / status events carry a table name; most tables
    // (masters, settings ...) have no automation record type - drop them here.
    if (eventType === "record.created" || eventType === "record.updated") {
      if (!TABLE_TO_RECORD_TYPE[payload.table]) return;
    } else if (eventType === "status.changed" && !TABLE_TO_RECORD_TYPE[payload.reference_table]) {
      return;
    }
    const ctx = buildEmitContext(reqOrCtx, payload);
    if (!ctx.company_masters_id) return;
    // Short delay so the originating request can finish writing the record
    // (items, status log, assignment ...) before flows read it.
    setTimeout(async () => {
      try {
        // Prefer the shared pooled connection: the request's own connection may
        // already be closed by then (some services close it right after commit).
        const pooled = await tenantDBForCompany(ctx.company_masters_id).catch(() => null);
        const tenantDB = pooled?.tenantDB || ctx.tenantDB;
        if (!tenantDB) return;
        await dispatch({ ...ctx, tenantDB }, eventType, payload);
      } catch (e) {
        logError(`emit ${eventType}`, e);
      }
    }, EMIT_DELAY_MS);
  } catch (e) {
    logError(`emit ${eventType}`, e);
  }
};

/**
 * Pre-read rows before an update so triggers can compare old -> new (13.2).
 * Returns [] without touching the DB when no active flow listens to this
 * table's record type.
 */
export const automationBefore = async (reqOrCtx, table, where) => {
  try {
    const ctx = buildEmitContext(reqOrCtx, {});
    const recordType = TABLE_TO_RECORD_TYPE[table];
    if (!ctx.tenantDB || !ctx.company_masters_id || !recordType) return [];
    if (!(await hasListenersForRecord(ctx.tenantDB, ctx.company_masters_id, recordType))) return [];
    return await fetchRowsByWhere(ctx.tenantDB, table, where);
  } catch (e) {
    logError(`automationBefore ${table}`, e);
    return [];
  }
};
