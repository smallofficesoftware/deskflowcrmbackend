import { automationModels } from "../../models/automation/automationModels.js";
import { evaluateRules } from "./conditions.js";
import { MAX_CHAIN_DEPTH } from "./constants.js";
import { startRun } from "./engine.js";
import { logError } from "./runtime.js";

// Decide which of the listening flows actually run for one event, then
// start them. Filters live in flow.trigger_config:
//   rules / match           field rules on the trigger context (AND / OR)
//   run_once                run at most once per record
//   cart_types [1,3]        only these document types (cart.*)
//   source_type_ids [..]    only these contact / inquiry sources
//   status_from / status_to status change filters (*.status_changed)
//   fields [..]             only when one of these fields changed (*.updated)
//   keyword_mode / keywords WhatsApp received: any | exact | contains | starts_with
//   business_hours_only     hold the start until business hours (engine)

const toList = (v) =>
  (Array.isArray(v) ? v : String(v ?? "").split(","))
    .map((s) => String(s).trim())
    .filter((s) => s !== "");

const inList = (value, list) => {
  const l = toList(list);
  return !l.length || l.includes(String(value ?? ""));
};

const keywordMatch = (text, mode, keywords) => {
  const t = String(text || "").toLowerCase().trim();
  const ks = toList(keywords).map((k) => k.toLowerCase());
  if (!mode || mode === "any" || !ks.length) return true;
  if (mode === "exact") return ks.includes(t);
  if (mode === "starts_with") return ks.some((k) => t.startsWith(k));
  return ks.some((k) => t.includes(k));
};

/** Built-in filters per trigger type; false = do not run. */
export const passesTypeFilters = (flow, ev) => {
  const cfg = flow.trigger_config || {};
  const rec = ev.record || {};
  if (ev.record_type === "cart" && !inList(rec.type, cfg.cart_types)) return false;
  if ((ev.record_type === "contact" || ev.record_type === "inquiry") && !inList(rec.source_type_id, cfg.source_type_ids)) {
    return false;
  }
  if (ev.type.endsWith(".status_changed")) {
    if (!inList(ev.status?.from, cfg.status_from)) return false;
    if (!inList(ev.status?.to, cfg.status_to)) return false;
  }
  if (ev.type.endsWith(".updated") && toList(cfg.fields).length) {
    const changed = ev.changed_fields || [];
    if (!toList(cfg.fields).some((f) => changed.includes(f))) return false;
  }
  if (ev.type === "whatsapp.received" && !keywordMatch(rec.description, cfg.keyword_mode, cfg.keywords)) return false;
  // Phones upload their whole call log on sync: ignore old calls.
  if (ev.type === "call.created") {
    const maxHours = Number(cfg.max_age_hours) || 24;
    const at = rec.call_date_time ? new Date(rec.call_date_time).getTime() : null;
    if (at && Date.now() - at > maxHours * 3600 * 1000) return false;
  }
  if (ev.type === "task.created" && cfg.task_kind) {
    const isTicket = Number(rec.is_support_ticket) === 1;
    if (cfg.task_kind === "ticket" && !isTicket) return false;
    if (cfg.task_kind === "task" && isTicket) return false;
  }
  return true;
};

export const passesOriginRules = (flow, ctx) => {
  if (ctx.origin === "import" && !Number(flow.include_imported_records)) return false;
  if (ctx.origin === "automation") {
    if (!Number(flow.allow_automation_trigger)) return false;
    if (ctx.chain_depth >= MAX_CHAIN_DEPTH) return false;
    if ((ctx.source_flow_ids || []).includes(flow.id)) return false;
  }
  return true;
};

/** Claim the run-once mark; false when this flow already ran for the record. */
export const claimRunMark = async (tenantDB, flow_id, record_type, record_id, period_key = "") => {
  if (!record_id) return true;
  const { RunMark } = automationModels(tenantDB);
  try {
    await RunMark.create({ flow_id, record_type, record_id, period_key, created_at: new Date() });
    return true;
  } catch {
    return false; // unique key hit
  }
};

export const triggerContextFromEvent = (ev) => ({
  trigger: { type: ev.type, at: new Date().toISOString() },
  record_type: ev.record_type,
  record_id: ev.id ? Number(ev.id) : null,
  record: ev.record || null,
  ...(ev.contact ? { contact: ev.contact } : {}),
  before: ev.before || null,
  changed_fields: ev.changed_fields || [],
  status: ev.status || null,
  data: ev.data || null,
  extra: ev.extra || null,
});

export const matchAndStart = async (ctx, ev, flows) => {
  for (const flow of flows) {
    try {
      if (flow.company_masters_id !== ctx.company_masters_id) continue;
      if (!passesOriginRules(flow, ctx)) continue;
      if (!passesTypeFilters(flow, ev)) continue;
      const triggerCtx = triggerContextFromEvent(ev);
      const cfg = flow.trigger_config || {};
      if (!evaluateRules(cfg.rules, cfg.match, triggerCtx)) continue;
      if (cfg.run_once && !(await claimRunMark(ctx.tenantDB, flow.id, ev.record_type, ev.id))) continue;
      await startRun({
        tenantDB: ctx.tenantDB,
        flow,
        company_masters_id: ctx.company_masters_id,
        triggerCtx,
        origin: ctx.origin,
        chain_depth: ctx.origin === "automation" ? ctx.chain_depth + 1 : 0,
        parent_execution_id: ctx.parent_execution_id,
        source_flow_ids: ctx.source_flow_ids,
      });
    } catch (e) {
      logError(`matchAndStart flow ${flow.id}`, e);
    }
  }
};
