import { Op } from "sequelize";
import { automationModels } from "../../models/automation/automationModels.js";
import { safeJsonParse } from "./context.js";
import { TRIGGERS } from "./constants.js";
import { tenantKey } from "./runtime.js";

// Short-lived cache of active flows per tenant DB + company, so every emit
// on a tenant without automations costs one in-memory lookup, not a query.
// TTL keeps other processes / servers in sync; saves also clear it here.

const TTL_MS = 60 * 1000;
const cache = new Map();

export const parseFlow = (row) => {
  if (!row) return null;
  const flow = row.get ? row.get({ plain: true }) : { ...row };
  flow.trigger_config = safeJsonParse(flow.trigger_config, {});
  flow.nodes = safeJsonParse(flow.nodes, []);
  flow.connections = safeJsonParse(flow.connections, []);
  return flow;
};

const load = async (tenantDB, company_masters_id) => {
  const { Flow } = automationModels(tenantDB);
  const rows = await Flow.findAll({
    where: { company_masters_id, is_active: 1, is_paused: 0, isDelete: 0 },
    raw: true,
  });
  return rows.map(parseFlow);
};

export const getActiveFlows = async (tenantDB, company_masters_id) => {
  if (!tenantDB || !company_masters_id) return [];
  const key = `${tenantKey(tenantDB)}|${company_masters_id}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.flows;
  let flows = [];
  try {
    flows = await load(tenantDB, company_masters_id);
  } catch {
    // Table missing on a tenant that has not been migrated yet: treat as
    // "no automations" instead of breaking the caller.
    flows = [];
  }
  cache.set(key, { flows, expires: Date.now() + TTL_MS });
  return flows;
};

export const getActiveFlowsForTrigger = async (tenantDB, company_masters_id, triggerType) =>
  (await getActiveFlows(tenantDB, company_masters_id)).filter((f) => f.trigger_type === triggerType);

/** True when any active flow listens to events of this record type. */
export const hasListenersForRecord = async (tenantDB, company_masters_id, recordType) =>
  (await getActiveFlows(tenantDB, company_masters_id)).some(
    (f) => TRIGGERS[f.trigger_type]?.record === recordType && TRIGGERS[f.trigger_type]?.source === "event"
  );

export const clearFlowCache = (tenantDB, company_masters_id) => {
  cache.delete(`${tenantKey(tenantDB)}|${company_masters_id}`);
};

/** Flow definition for a run: the version it started on (13.13). */
export const loadFlowForRun = async (tenantDB, flow_id, version) => {
  const { Flow, FlowVersion } = automationModels(tenantDB);
  const flow = parseFlow(await Flow.findOne({ where: { id: flow_id }, raw: true }));
  if (!flow) return null;
  if (version && version !== flow.version) {
    const snap = await FlowVersion.findOne({ where: { flow_id, version }, raw: true });
    if (snap) {
      flow.trigger_config = safeJsonParse(snap.trigger_config, {});
      flow.nodes = safeJsonParse(snap.nodes, []);
      flow.connections = safeJsonParse(snap.connections, []);
      flow.version = version;
    }
  }
  return flow;
};

/** All flows (any company) of a trigger source, for the scheduler. */
export const getCronFlows = async (tenantDB, companyIds) => {
  const { Flow } = automationModels(tenantDB);
  const cronTypes = Object.entries(TRIGGERS).filter(([, t]) => t.source === "cron").map(([k]) => k);
  const rows = await Flow.findAll({
    where: {
      company_masters_id: { [Op.in]: companyIds },
      trigger_type: { [Op.in]: cronTypes },
      is_active: 1,
      is_paused: 0,
      isDelete: 0,
    },
    raw: true,
  });
  return rows.map(parseFlow);
};
