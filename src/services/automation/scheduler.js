import cron from "node-cron";
import { Op, QueryTypes } from "sequelize";
import { automationModels } from "../../models/automation/automationModels.js";
import { findDueItems, maxPerDay } from "./cronTriggers.js";
import { LOG_RETENTION_DAYS } from "./constants.js";
import { resumeExecution, startRun } from "./engine.js";
import { getCronFlows } from "./flowStore.js";
import { getSettings, isMaintenanceOn } from "./limits.js";
import { fetchRowById } from "./records.js";
import { listTenantDatabases, logError, setAutomationIo } from "./runtime.js";
import { claimRunMark } from "./triggers.js";
import { RECORD_TYPE_TO_TABLE } from "./constants.js";
import logger from "../../utils/logger.js";

// One in-process cron (plan section 7). Every minute, for every tenant DB:
//   1. resume waiting runs whose resume_at has passed
//   2. fail runs stuck in "running" (server restarted mid-run)
//   3. find and start time / date / inactivity / overdue triggers
// Nightly: purge runs older than LOG_RETENTION_DAYS (13.12).

const RESUME_BATCH = 50;
const STUCK_MINUTES = 15;

let ticking = false;
let started = false;

const resumeDue = async (tenantDB) => {
  const { Execution } = automationModels(tenantDB);
  const due = await Execution.findAll({
    where: { status: "waiting", resume_at: { [Op.lte]: new Date() } },
    order: [["resume_at", "ASC"]],
    limit: RESUME_BATCH,
    raw: true,
  });
  for (const row of due) await resumeExecution(tenantDB, row);
};

const failStuck = async (tenantDB) => {
  const { Execution } = automationModels(tenantDB);
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);
  await Execution.update(
    { status: "failed", error: "Interrupted (server restarted while running)", completed_at: new Date() },
    { where: { status: "running", started_at: { [Op.lt]: cutoff } } }
  );
};

const runsToday = async (tenantDB, flowId) => {
  const [row] = await tenantDB.query(
    "SELECT COUNT(*) AS c FROM `automation_executions` WHERE `flow_id` = ? AND `origin` = 'schedule' AND `started_at` >= CURDATE()",
    { replacements: [flowId], type: QueryTypes.SELECT }
  );
  return Number(row?.c || 0);
};

const runCronFlow = async (tenantDB, flow) => {
  const settings = await getSettings(tenantDB, flow.company_masters_id);
  const items = await findDueItems(flow, tenantDB, settings);
  if (!items.length) return;
  let budget = maxPerDay(flow) - (await runsToday(tenantDB, flow.id));

  for (const item of items) {
    if (budget <= 0) break;
    if (!(await claimRunMark(tenantDB, flow.id, item.record_type, item.id, item.period_key))) continue;
    let record = item.record || null;
    if (!record && !item.standalone) {
      const table = RECORD_TYPE_TO_TABLE[item.record_type];
      record = table ? await fetchRowById(tenantDB, table, item.id) : null;
    }
    budget -= 1;
    await startRun({
      tenantDB,
      flow,
      company_masters_id: flow.company_masters_id,
      origin: "schedule",
      triggerCtx: {
        trigger: { type: flow.trigger_type, at: new Date().toISOString() },
        record_type: item.standalone ? null : item.record_type,
        record_id: item.standalone ? null : Number(item.id),
        record,
        extra: item.extra || null,
      },
    });
  }
};

// Tenant DBs that have not run the automation migration: skip for a while
// instead of running 3 failing queries per minute per tenant.
const NO_TABLES_SKIP_MS = 10 * 60 * 1000;
const skipUntil = new Map();
const loggedUnreachable = new Set();
const UNREACHABLE_TENANT = /doesn't exist|ER_NO_SUCH_TABLE|Unknown database|ER_BAD_DB_ERROR|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Access denied|ER_DBACCESS_DENIED/i;

const tickTenant = async ({ tenantDB, companies, db_name }) => {
  if ((skipUntil.get(db_name) || 0) > Date.now()) return;
  try {
    await failStuck(tenantDB);
    await resumeDue(tenantDB);
    const flows = await getCronFlows(tenantDB, companies);
    for (const flow of flows) {
      try {
        await runCronFlow(tenantDB, flow);
      } catch (e) {
        logError(`cron flow ${flow.id} (${db_name})`, e);
      }
    }
  } catch (e) {
    // Not migrated yet / database missing / server unreachable: skip this tenant for a while and
    // log ONCE per outage, instead of the same error for every tenant every minute.
    if (UNREACHABLE_TENANT.test(String(e?.message)) || UNREACHABLE_TENANT.test(String(e?.parent?.code))) {
      skipUntil.set(db_name, Date.now() + NO_TABLES_SKIP_MS);
      if (!/doesn't exist|ER_NO_SUCH_TABLE/i.test(String(e?.message)) && !loggedUnreachable.has(db_name)) {
        loggedUnreachable.add(db_name);
        logError(`tenant ${db_name} skipped (${e?.message})`, e);
      }
    } else {
      logError(`tick ${db_name}`, e);
    }
  }
};

export const runSchedulerTick = async () => {
  if (ticking) return;
  ticking = true;
  try {
    if (await isMaintenanceOn()) return;
    const tenants = await listTenantDatabases();
    for (const t of tenants) await tickTenant(t);
  } catch (e) {
    logError("scheduler tick", e);
  } finally {
    ticking = false;
  }
};

export const purgeOldRuns = async () => {
  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const tenants = await listTenantDatabases();
  for (const { tenantDB, db_name } of tenants) {
    try {
      const { Execution } = automationModels(tenantDB);
      const old = await Execution.findAll({
        where: { started_at: { [Op.lt]: cutoff }, status: { [Op.notIn]: ["waiting", "running"] } },
        attributes: ["id"],
        limit: 5000,
        raw: true,
      });
      if (!old.length) continue;
      const ids = old.map((r) => r.id);
      await tenantDB.query("DELETE FROM `automation_execution_logs` WHERE `execution_id` IN (:ids)", { replacements: { ids } });
      await tenantDB.query("DELETE FROM `automation_executions` WHERE `id` IN (:ids)", { replacements: { ids } });
      await tenantDB.query("DELETE FROM `automation_run_marks` WHERE `created_at` < ?", { replacements: [cutoff] });
      logger.info(`automation purge: removed ${ids.length} run(s) from ${db_name}`);
    } catch (e) {
      if (!/doesn't exist|ER_NO_SUCH_TABLE/i.test(String(e?.message))) logError(`purge ${db_name}`, e);
    }
  }
};

/** Call once at boot (W2). Safe to call twice. */
export const startAutomationCron = (io) => {
  if (started) return;
  started = true;
  setAutomationIo(io);
  cron.schedule("* * * * *", () => {
    runSchedulerTick().catch((e) => logError("scheduler", e));
  });
  cron.schedule("30 3 * * *", () => {
    purgeOldRuns().catch((e) => logError("purge", e));
  });
  logger.info("Automation scheduler started");
};

