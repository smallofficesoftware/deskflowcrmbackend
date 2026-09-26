import { Op, QueryTypes } from "sequelize";
import { requestContext } from "../../config/context.js";
import { automationModels } from "../../models/automation/automationModels.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { buildCatalog } from "./catalog.js";
import { RECORD_TYPE_TO_TABLE, TRIGGERS } from "./constants.js";
import { safeJsonParse } from "./context.js";
import { startRun } from "./engine.js";
import { clearFlowCache, parseFlow } from "./flowStore.js";
import { canActivateFlow, clearSettingsCache, getMonthlyRuns, getPlanLimits, getSettings } from "./limits.js";
import { fetchRowById } from "./records.js";
import { getTemplate, listTemplates } from "./templates.js";
import { businessHoursOrNull, numOrNull, timeOrNull, timezoneOr } from "./settingsSanitize.js";
import { validateFlow } from "./validate.js";
import { newSecret, newToken, webhookUrl } from "./webhookIn.js";

// Service functions behind the Automations APIs. All take the usual Express
// `req` (after authenticateToken + tenantMiddleware) and return resSuccess /
// resError shapes like the rest of the CRM.

const ctxOf = (req) => {
  const store = requestContext.getStore() || {};
  return {
    tenantDB: req.tenantDB,
    company: Number(store.companyId || req.user?.companyId),
    userId: Number(store.a_application_login_id || req.user?.id || req.user?.a_application_login_id),
  };
};

const models = (req) => automationModels(req.tenantDB);
const json = (v) => (v == null ? null : typeof v === "string" ? v : JSON.stringify(v));
const bool = (v) => (v === true || v === 1 || v === "1" ? 1 : 0);

const flowSummary = (row, hook) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  trigger_type: row.trigger_type,
  trigger_label: TRIGGERS[row.trigger_type]?.label || row.trigger_type,
  is_active: row.is_active,
  is_paused: row.is_paused,
  paused_reason: row.paused_reason,
  version: row.version,
  last_run_at: row.last_run_at,
  run_count: row.run_count,
  step_count: Math.max((safeJsonParse(row.nodes, []).length || 1) - 1, 0),
  created_by: row.created_by,
  modified_date: row.modified_date,
  webhook_url: hook ? webhookUrl(row.company_masters_id, hook.token) : null,
});

const ensureWebhook = async (req, flow) => {
  if (flow.trigger_type !== "webhook.received") return;
  const { Webhook } = models(req);
  const c = ctxOf(req);
  const existing = await Webhook.findOne({ where: { flow_id: flow.id, isDelete: 0 } });
  if (!existing) {
    await Webhook.create({ flow_id: flow.id, company_masters_id: c.company, token: newToken(), secret: newSecret(), auth_type: "token", is_active: 1, created_date_time: new Date() });
  }
};

// ------------------------------------------------------------------ flows

export const listFlows = async (req) => {
  try {
    const c = ctxOf(req);
    const { Flow, Webhook } = models(req);
    const rows = await Flow.findAll({ where: { company_masters_id: c.company, isDelete: 0 }, order: [["id", "DESC"]], raw: true });
    const hooks = rows.length ? await Webhook.findAll({ where: { flow_id: { [Op.in]: rows.map((r) => r.id) }, isDelete: 0 }, raw: true }) : [];
    const byFlow = new Map(hooks.map((h) => [h.flow_id, h]));
    return resSuccess({ data: { item: rows.map((r) => flowSummary(r, byFlow.get(r.id))) } });
  } catch (e) {
    return resBadRequest({ developer_msg: `listFlows: ${e.message}` });
  }
};

export const getFlow = async (req) => {
  try {
    const c = ctxOf(req);
    const { Flow, Webhook } = models(req);
    const row = await Flow.findOne({ where: { id: req.body.id, company_masters_id: c.company, isDelete: 0 }, raw: true });
    if (!row) return resError({ ack_msg: "Automation not found" });
    const hook = await Webhook.findOne({ where: { flow_id: row.id, isDelete: 0 }, raw: true });
    return resSuccess({
      data: {
        item: {
          ...flowSummary(row, hook),
          trigger_config: safeJsonParse(row.trigger_config, {}),
          nodes: safeJsonParse(row.nodes, []),
          connections: safeJsonParse(row.connections, []),
          run_as_user_id: row.run_as_user_id,
          allow_automation_trigger: row.allow_automation_trigger,
          include_imported_records: row.include_imported_records,
          webhook: hook ? { url: webhookUrl(c.company, hook.token), auth_type: hook.auth_type, secret: hook.auth_type === "token" ? null : hook.secret, is_active: hook.is_active, last_called_at: hook.last_called_at } : null,
        },
      },
    });
  } catch (e) {
    return resBadRequest({ developer_msg: `getFlow: ${e.message}` });
  }
};

/**
 * Create or update. Drafts may be incomplete; an ACTIVE flow is validated in
 * full before the save is accepted.
 */
export const saveFlow = async (req) => {
  try {
    const c = ctxOf(req);
    const { Flow, FlowVersion } = models(req);
    const b = req.body || {};
    const draft = {
      name: String(b.name || "").trim(),
      description: b.description || null,
      trigger_type: b.trigger_type,
      trigger_config: safeJsonParse(b.trigger_config, {}),
      nodes: safeJsonParse(b.nodes, []),
      connections: safeJsonParse(b.connections, []),
    };

    let existing = null;
    if (b.id) {
      existing = await Flow.findOne({ where: { id: b.id, company_masters_id: c.company, isDelete: 0 } });
      if (!existing) return resError({ ack_msg: "Automation not found" });
    }

    const errors = validateFlow(draft, { complete: !!existing?.is_active });
    if (errors.length) return resError({ ack_msg: errors[0], data: { errors } });

    const values = {
      name: draft.name,
      description: draft.description,
      trigger_type: draft.trigger_type,
      trigger_config: json(draft.trigger_config),
      nodes: json(draft.nodes),
      connections: json(draft.connections),
      run_as_user_id: Number(b.run_as_user_id) || existing?.run_as_user_id || c.userId,
      allow_automation_trigger: bool(b.allow_automation_trigger),
      include_imported_records: bool(b.include_imported_records),
      modified_by: c.userId,
    };

    let flow;
    if (!existing) {
      flow = await Flow.create({ ...values, company_masters_id: c.company, is_active: 0, version: 1, created_by: c.userId, created_date_time: new Date() });
      await FlowVersion.create({ flow_id: flow.id, version: 1, trigger_type: values.trigger_type, trigger_config: values.trigger_config, nodes: values.nodes, connections: values.connections, saved_by: c.userId, saved_at: new Date() });
    } else {
      const changed =
        existing.trigger_type !== values.trigger_type ||
        existing.trigger_config !== values.trigger_config ||
        existing.nodes !== values.nodes ||
        existing.connections !== values.connections;
      const version = changed ? existing.version + 1 : existing.version;
      await existing.update({ ...values, version });
      if (changed) {
        await FlowVersion.create({ flow_id: existing.id, version, trigger_type: values.trigger_type, trigger_config: values.trigger_config, nodes: values.nodes, connections: values.connections, saved_by: c.userId, saved_at: new Date() });
      }
      flow = existing;
    }
    await ensureWebhook(req, flow);
    clearFlowCache(req.tenantDB, c.company);
    return resSuccess({ ack_msg: "Automation saved", data: { item: { id: flow.id, version: flow.version } } });
  } catch (e) {
    return resBadRequest({ developer_msg: `saveFlow: ${e.message}` });
  }
};

/** Switch on / off. Switching on validates fully, checks the plan limit, clears pause. */
export const toggleFlow = async (req) => {
  try {
    const c = ctxOf(req);
    const { Flow } = models(req);
    const flow = await Flow.findOne({ where: { id: req.body.id, company_masters_id: c.company, isDelete: 0 } });
    if (!flow) return resError({ ack_msg: "Automation not found" });
    const on = bool(req.body.is_active);
    if (on) {
      const errors = validateFlow(parseFlow(flow), { complete: true });
      if (errors.length) return resError({ ack_msg: errors[0], data: { errors } });
      const limit = await canActivateFlow(req.tenantDB, c.company, flow.id);
      if (!limit.ok) return resError({ ack_msg: limit.reason });
      await flow.update({ is_active: 1, is_paused: 0, paused_reason: null, consecutive_failures: 0, modified_by: c.userId });
    } else {
      await flow.update({ is_active: 0, modified_by: c.userId });
    }
    clearFlowCache(req.tenantDB, c.company);
    return resSuccess({ ack_msg: on ? "Automation is on" : "Automation is off", data: { item: { id: flow.id, is_active: on } } });
  } catch (e) {
    return resBadRequest({ developer_msg: `toggleFlow: ${e.message}` });
  }
};

export const deleteFlow = async (req) => {
  try {
    const c = ctxOf(req);
    const { Flow, Execution, Webhook } = models(req);
    const flow = await Flow.findOne({ where: { id: req.body.id, company_masters_id: c.company, isDelete: 0 } });
    if (!flow) return resError({ ack_msg: "Automation not found" });
    await flow.update({ isDelete: 1, is_active: 0, modified_by: c.userId });
    await Execution.update({ status: "cancelled", completed_at: new Date(), error: "Automation deleted" }, { where: { flow_id: flow.id, status: "waiting" } });
    await Webhook.update({ isDelete: 1, is_active: 0 }, { where: { flow_id: flow.id } });
    clearFlowCache(req.tenantDB, c.company);
    return resSuccess({ ack_msg: "Automation deleted" });
  } catch (e) {
    return resBadRequest({ developer_msg: `deleteFlow: ${e.message}` });
  }
};

export const duplicateFlow = async (req) => {
  try {
    const c = ctxOf(req);
    const { Flow, FlowVersion } = models(req);
    const src = await Flow.findOne({ where: { id: req.body.id, company_masters_id: c.company, isDelete: 0 }, raw: true });
    if (!src) return resError({ ack_msg: "Automation not found" });
    const copy = await Flow.create({
      ...src,
      id: undefined,
      name: `${src.name} (copy)`.slice(0, 150),
      is_active: 0,
      is_paused: 0,
      paused_reason: null,
      consecutive_failures: 0,
      version: 1,
      last_run_at: null,
      run_count: 0,
      created_by: c.userId,
      modified_by: c.userId,
      created_date_time: new Date(),
      modified_date: undefined,
    });
    await FlowVersion.create({ flow_id: copy.id, version: 1, trigger_type: copy.trigger_type, trigger_config: copy.trigger_config, nodes: copy.nodes, connections: copy.connections, saved_by: c.userId, saved_at: new Date() });
    await ensureWebhook(req, copy);
    return resSuccess({ ack_msg: "Automation duplicated", data: { item: { id: copy.id } } });
  } catch (e) {
    return resBadRequest({ developer_msg: `duplicateFlow: ${e.message}` });
  }
};

// ------------------------------------------------------------------ runs

const runFor = async (req, { is_test }) => {
  const c = ctxOf(req);
  const { Flow } = models(req);
  const { id, record_id, record_type, data } = req.body || {};
  const flow = parseFlow(await Flow.findOne({ where: { id, company_masters_id: c.company, isDelete: 0 } }));
  if (!flow) return resError({ ack_msg: "Automation not found" });
  const errors = validateFlow(flow, { complete: true });
  if (errors.length) return resError({ ack_msg: errors[0], data: { errors } });

  const trigger = TRIGGERS[flow.trigger_type];
  const type = record_type || trigger?.record || flow.trigger_config?.record_type || null;
  let record = null;
  if (type) {
    const table = RECORD_TYPE_TO_TABLE[type];
    if (!table) return resError({ ack_msg: `Unknown record type "${type}"` });
    if (record_id) {
      record = await fetchRowById(req.tenantDB, table, record_id);
      if (!record || (record.company_masters_id && Number(record.company_masters_id) !== c.company)) {
        return resError({ ack_msg: "Record not found" });
      }
    } else if (flow.trigger_type !== "webhook.received") {
      return resError({ ack_msg: `Pick a ${type} to run on` });
    }
  }

  const result = await startRun({
    tenantDB: req.tenantDB,
    flow,
    company_masters_id: c.company,
    origin: "user",
    is_test,
    triggerCtx: {
      trigger: { type: flow.trigger_type, at: new Date().toISOString(), test: is_test },
      record_type: type,
      record_id: record ? Number(record.id) : null,
      record,
      data: safeJsonParse(data, data || null),
    },
  });
  return resSuccess({ ack_msg: is_test ? "Test finished (nothing was sent or changed)" : "Automation started", data: { item: result } });
};

export const testFlow = async (req) => {
  try {
    return await runFor(req, { is_test: true });
  } catch (e) {
    return resBadRequest({ developer_msg: `testFlow: ${e.message}` });
  }
};

export const runFlowManually = async (req) => {
  try {
    return await runFor(req, { is_test: false });
  } catch (e) {
    return resBadRequest({ developer_msg: `runFlowManually: ${e.message}` });
  }
};

// ------------------------------------------------------------------ executions

export const listExecutions = async (req) => {
  try {
    const c = ctxOf(req);
    const { flow_id, status, record_type, record_id, from, to, include_tests } = req.body || {};
    const limit = Math.min(Math.max(Number(req.body?.limit) || 25, 1), 100);
    const page = Math.max(Number(req.body?.page) || 1, 1);
    const where = { company_masters_id: c.company };
    if (flow_id) where.flow_id = flow_id;
    if (status) where.status = status;
    if (record_type) where.record_type = record_type;
    if (record_id) where.record_id = record_id;
    if (!include_tests) where.is_test = 0;
    if (from || to) where.started_at = { ...(from ? { [Op.gte]: new Date(from) } : {}), ...(to ? { [Op.lte]: new Date(to) } : {}) };
    const { Execution } = models(req);
    const { rows, count } = await Execution.findAndCountAll({
      where,
      attributes: ["id", "flow_id", "flow_version", "record_type", "record_id", "status", "is_test", "origin", "started_at", "completed_at", "resume_at", "error"],
      order: [["id", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      raw: true,
    });
    const names = new Map();
    const ids = [...new Set(rows.map((r) => r.flow_id))];
    if (ids.length) {
      const flows = await models(req).Flow.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "name"], raw: true });
      flows.forEach((f) => names.set(f.id, f.name));
    }
    return resSuccess({ data: { item: rows.map((r) => ({ ...r, flow_name: names.get(r.flow_id) || null })), total: count, page, limit } });
  } catch (e) {
    return resBadRequest({ developer_msg: `listExecutions: ${e.message}` });
  }
};

export const getExecution = async (req) => {
  try {
    const c = ctxOf(req);
    const { Execution, ExecutionLog, Flow, FlowVersion } = models(req);
    const run = await Execution.findOne({ where: { id: req.body.id, company_masters_id: c.company }, raw: true });
    if (!run) return resError({ ack_msg: "Run not found" });
    const logs = await ExecutionLog.findAll({ where: { execution_id: run.id }, order: [["id", "ASC"]], raw: true });
    const flow = await Flow.findOne({ where: { id: run.flow_id }, raw: true });
    const snap = await FlowVersion.findOne({ where: { flow_id: run.flow_id, version: run.flow_version }, raw: true });
    const def = snap || flow;
    return resSuccess({
      data: {
        item: {
          ...run,
          context: safeJsonParse(run.context, {}),
          logs: logs.map((l) => ({ ...l, input: safeJsonParse(l.input, l.input), output: safeJsonParse(l.output, l.output) })),
          flow: { id: flow?.id, name: flow?.name, nodes: safeJsonParse(def?.nodes, []), connections: safeJsonParse(def?.connections, []) },
        },
      },
    });
  } catch (e) {
    return resBadRequest({ developer_msg: `getExecution: ${e.message}` });
  }
};

export const cancelExecution = async (req) => {
  try {
    const c = ctxOf(req);
    const { Execution } = models(req);
    const [n] = await Execution.update(
      { status: "cancelled", completed_at: new Date(), error: "Cancelled by user" },
      { where: { id: req.body.id, company_masters_id: c.company, status: { [Op.in]: ["waiting", "running"] } } }
    );
    return n ? resSuccess({ ack_msg: "Run cancelled" }) : resError({ ack_msg: "Only waiting runs can be cancelled" });
  } catch (e) {
    return resBadRequest({ developer_msg: `cancelExecution: ${e.message}` });
  }
};

// ------------------------------------------------------------------ webhooks

export const listWebhooks = async (req) => {
  try {
    const c = ctxOf(req);
    const { Webhook, Flow } = models(req);
    const hooks = await Webhook.findAll({ where: { company_masters_id: c.company, isDelete: 0 }, raw: true });
    const flows = hooks.length ? await Flow.findAll({ where: { id: { [Op.in]: hooks.map((h) => h.flow_id) } }, attributes: ["id", "name", "is_active"], raw: true }) : [];
    const byId = new Map(flows.map((f) => [f.id, f]));
    return resSuccess({
      data: {
        item: hooks.map((h) => ({
          id: h.id,
          flow_id: h.flow_id,
          flow_name: byId.get(h.flow_id)?.name || null,
          flow_active: byId.get(h.flow_id)?.is_active || 0,
          url: webhookUrl(c.company, h.token),
          auth_type: h.auth_type,
          is_active: h.is_active,
          last_called_at: h.last_called_at,
          listening: !!(h.listen_until && new Date(h.listen_until) > new Date()),
          has_sample: !!h.sample_payload,
        })),
      },
    });
  } catch (e) {
    return resBadRequest({ developer_msg: `listWebhooks: ${e.message}` });
  }
};

/** Start "listen for sample": next call is stored, not run (5 minutes). */
export const listenForSample = async (req) => {
  try {
    const c = ctxOf(req);
    const { Webhook } = models(req);
    const [n] = await Webhook.update(
      { listen_until: new Date(Date.now() + 5 * 60 * 1000), sample_payload: null },
      { where: { flow_id: req.body.flow_id, company_masters_id: c.company, isDelete: 0 } }
    );
    return n ? resSuccess({ ack_msg: "Listening for 5 minutes - send a test call now" }) : resError({ ack_msg: "Webhook not found" });
  } catch (e) {
    return resBadRequest({ developer_msg: `listenForSample: ${e.message}` });
  }
};

export const getSample = async (req) => {
  try {
    const c = ctxOf(req);
    const { Webhook } = models(req);
    const h = await Webhook.findOne({ where: { flow_id: req.body.flow_id, company_masters_id: c.company, isDelete: 0 }, raw: true });
    if (!h) return resError({ ack_msg: "Webhook not found" });
    return resSuccess({
      data: { item: { listening: !!(h.listen_until && new Date(h.listen_until) > new Date()), sample: safeJsonParse(h.sample_payload, null) } },
    });
  } catch (e) {
    return resBadRequest({ developer_msg: `getSample: ${e.message}` });
  }
};

/** Change token (rotate) and / or auth: { flow_id, auth_type: token|secret|hmac, rotate: bool } */
export const updateWebhook = async (req) => {
  try {
    const c = ctxOf(req);
    const { Webhook } = models(req);
    const h = await Webhook.findOne({ where: { flow_id: req.body.flow_id, company_masters_id: c.company, isDelete: 0 } });
    if (!h) return resError({ ack_msg: "Webhook not found" });
    const patch = {};
    if (["token", "secret", "hmac"].includes(req.body.auth_type)) patch.auth_type = req.body.auth_type;
    if (req.body.rotate) {
      patch.token = newToken();
      patch.secret = newSecret();
    }
    if (req.body.is_active !== undefined) patch.is_active = bool(req.body.is_active);
    await h.update(patch);
    return resSuccess({ ack_msg: "Webhook updated", data: { item: { url: webhookUrl(c.company, h.token), auth_type: h.auth_type, secret: h.auth_type === "token" ? null : h.secret } } });
  } catch (e) {
    return resBadRequest({ developer_msg: `updateWebhook: ${e.message}` });
  }
};

// ------------------------------------------------------------------ settings / usage / catalog

export const getAutomationSettings = async (req) => {
  try {
    const c = ctxOf(req);
    return resSuccess({ data: { item: await getSettings(req.tenantDB, c.company) } });
  } catch (e) {
    return resBadRequest({ developer_msg: `getAutomationSettings: ${e.message}` });
  }
};


export const saveAutomationSettings = async (req) => {
  try {
    const c = ctxOf(req);
    const { Settings } = models(req);
    const b = req.body || {};
    const values = {
      wa_limit_per_minute: numOrNull(b.wa_limit_per_minute),
      wa_limit_per_day: numOrNull(b.wa_limit_per_day),
      quiet_hours_from: timeOrNull(b.quiet_hours_from),
      quiet_hours_to: timeOrNull(b.quiet_hours_to),
      business_hours: json(businessHoursOrNull(b.business_hours)),
      timezone: timezoneOr(b.timezone),
      failure_alert_user_ids: [].concat(b.failure_alert_user_ids || []).map(Number).filter(Boolean).join(",") || null,
      modified_by: c.userId,
    };
    const existing = await Settings.findOne({ where: { company_masters_id: c.company } });
    if (existing) await existing.update(values);
    else await Settings.create({ ...values, company_masters_id: c.company });
    clearSettingsCache(req.tenantDB, c.company);
    return resSuccess({ ack_msg: "Settings saved" });
  } catch (e) {
    return resBadRequest({ developer_msg: `saveAutomationSettings: ${e.message}` });
  }
};

export const getUsage = async (req) => {
  try {
    const c = ctxOf(req);
    const limits = await getPlanLimits(c.company);
    const [active] = await req.tenantDB.query(
      "SELECT COUNT(*) AS c FROM `automation_flows` WHERE `company_masters_id` = ? AND `is_active` = 1 AND `isDelete` = 0",
      { replacements: [c.company], type: QueryTypes.SELECT }
    );
    return resSuccess({
      data: { item: { active_flows: Number(active?.c || 0), included: limits.included, max_active_flows: limits.max_active_flows, runs_this_month: await getMonthlyRuns(req.tenantDB, c.company), max_runs_per_month: limits.max_runs_per_month } },
    });
  } catch (e) {
    return resBadRequest({ developer_msg: `getUsage: ${e.message}` });
  }
};

export const getCatalog = async () => resSuccess({ data: { item: buildCatalog() } });

// ------------------------------------------------------------------ templates

export const getTemplateList = async () => resSuccess({ data: { item: listTemplates() } });

/** Creates a normal DRAFT flow from a ready-made template (through saveFlow, so the same validation applies). */
export const useTemplate = async (req) => {
  const t = getTemplate(req.body?.key);
  if (!t) return resError({ ack_msg: "Template not found" });
  return saveFlow({
    ...req,
    body: {
      name: t.name,
      description: t.description,
      trigger_type: t.trigger_type,
      trigger_config: t.trigger_config,
      nodes: t.nodes,
      connections: t.connections,
    },
  });
};
