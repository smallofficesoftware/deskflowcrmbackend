import moment from "moment";
import { Op } from "sequelize";
import sequelize from "../../config/sequelize.js";
import companyVsPlansModel from "../../models/configuration/companyVsPlanModel.js";
import maintenanceModesModel from "../../models/configuration/maintenanceModesModel.js";
import { automationModels } from "../../models/automation/automationModels.js";
import { DEFAULT_PLAN_LIMITS, DEFAULT_TIMEZONE } from "./constants.js";
import { safeJsonParse } from "./context.js";
import { limitsFromDataLimit, PLAN_PAGE_SLUG } from "./planLimit.js";

// Plan limits, monthly usage, per-company settings, maintenance.

const limitCache = new Map();
const LIMIT_TTL_MS = 5 * 60 * 1000;

/**
 * { included, max_active_flows, max_runs_per_month, source } for a company. null limit = unlimited.
 *   source "plan"          the plan has the Workflow Automation page; limit = its data_limit
 *   source "not_included"  the plan does not include that page -> included:false (cannot switch on / run)
 *   source "default"       no plan record for the company (trial / legacy) -> built-in safety net
 * Cached for 5 minutes, so an admin's change on the Plans screen takes up to that long to apply.
 */
export const getPlanLimits = async (company_masters_id) => {
  const hit = limitCache.get(company_masters_id);
  if (hit && hit.expires > Date.now()) return hit.limits;
  let limits = { included: true, ...DEFAULT_PLAN_LIMITS, source: "default" };
  try {
    const plan = await companyVsPlansModel.findOne({
      where: { company_masters_id, isDelete: 0 },
      order: [["id", "DESC"]],
      attributes: ["plan_id"],
      raw: true,
    });
    if (plan?.plan_id) {
      const [page] = await sequelize.query(
        "SELECT `id` FROM `a_application_pages` WHERE `page_slug` = ? AND `isDelete` = 0 LIMIT 1",
        { replacements: [PLAN_PAGE_SLUG], type: sequelize.QueryTypes.SELECT }
      );
      if (page) {
        const [entitlement] = await sequelize.query(
          "SELECT `data_limit` FROM `plan_vs_pages` WHERE `plan_id` = ? AND `page_id` = ? AND `isDelete` = 0 AND `isActive` = 1 LIMIT 1",
          { replacements: [plan.plan_id, page.id], type: sequelize.QueryTypes.SELECT }
        );
        limits = entitlement
          ? { included: true, ...limitsFromDataLimit(entitlement.data_limit), source: "plan" }
          : { included: false, max_active_flows: 0, max_runs_per_month: 0, source: "not_included" };
      }
    }
  } catch {
    // master tables unreadable: keep the safety-net defaults rather than blocking everyone
  }
  limitCache.set(company_masters_id, { limits, expires: Date.now() + LIMIT_TTL_MS });
  return limits;
};

const NOT_INCLUDED = "Automations are not included in your plan";

const yearMonth = () => moment().format("YYYY-MM");

export const getMonthlyRuns = async (tenantDB, company_masters_id) => {
  const { Usage } = automationModels(tenantDB);
  const row = await Usage.findOne({ where: { company_masters_id, year_month: yearMonth() }, raw: true });
  return row?.runs || 0;
};

/** { ok, reason } - checks runs/month for this company. */
export const canStartRun = async (tenantDB, company_masters_id) => {
  const { included, max_runs_per_month } = await getPlanLimits(company_masters_id);
  if (!included) return { ok: false, reason: NOT_INCLUDED };
  if (max_runs_per_month == null) return { ok: true };
  const used = await getMonthlyRuns(tenantDB, company_masters_id);
  return used < max_runs_per_month
    ? { ok: true }
    : { ok: false, reason: `Monthly run limit reached (${max_runs_per_month})` };
};

export const incrementUsage = async (tenantDB, company_masters_id) => {
  await tenantDB.query(
    "INSERT INTO `automation_usage` (`company_masters_id`, `year_month`, `runs`) VALUES (?, ?, 1) " +
      "ON DUPLICATE KEY UPDATE `runs` = `runs` + 1",
    { replacements: [company_masters_id, yearMonth()] }
  );
};

/** { ok, reason } - checks active flows for activation. */
export const canActivateFlow = async (tenantDB, company_masters_id, excludeFlowId) => {
  const { included, max_active_flows } = await getPlanLimits(company_masters_id);
  if (!included) return { ok: false, reason: NOT_INCLUDED };
  if (max_active_flows == null) return { ok: true };
  const { Flow } = automationModels(tenantDB);
  const active = await Flow.count({
    where: {
      company_masters_id,
      is_active: 1,
      isDelete: 0,
      ...(excludeFlowId ? { id: { [Op.ne]: excludeFlowId } } : {}),
    },
  });
  return active < max_active_flows
    ? { ok: true }
    : { ok: false, reason: `Your plan allows ${max_active_flows} active automations` };
};

const settingsCache = new Map();

export const getSettings = async (tenantDB, company_masters_id) => {
  const key = `${tenantDB?.config?.database}|${company_masters_id}`;
  const hit = settingsCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.settings;
  let row = null;
  try {
    row = await automationModels(tenantDB).Settings.findOne({ where: { company_masters_id }, raw: true });
  } catch {
    row = null;
  }
  const settings = {
    wa_limit_per_minute: row?.wa_limit_per_minute ?? null,
    wa_limit_per_day: row?.wa_limit_per_day ?? null,
    // MySQL TIME comes back as "21:00:00"; the API speaks "HH:MM" everywhere.
    quiet_hours_from: row?.quiet_hours_from ? String(row.quiet_hours_from).slice(0, 5) : null,
    quiet_hours_to: row?.quiet_hours_to ? String(row.quiet_hours_to).slice(0, 5) : null,
    business_hours: safeJsonParse(row?.business_hours, null),
    timezone: row?.timezone || DEFAULT_TIMEZONE,
    failure_alert_user_ids: String(row?.failure_alert_user_ids || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter(Boolean),
  };
  settingsCache.set(key, { settings, expires: Date.now() + 60 * 1000 });
  return settings;
};

export const clearSettingsCache = (tenantDB, company_masters_id) =>
  settingsCache.delete(`${tenantDB?.config?.database}|${company_masters_id}`);

let maintenance = { value: false, expires: 0 };
export const isMaintenanceOn = async () => {
  if (maintenance.expires > Date.now()) return maintenance.value;
  let value = false;
  try {
    const row = await maintenanceModesModel.findOne({ attributes: ["is_maintenance"], raw: true });
    value = Number(row?.is_maintenance) === 1;
  } catch {
    value = false;
  }
  maintenance = { value, expires: Date.now() + 30 * 1000 };
  return value;
};

/** "now" in the company timezone as a moment. */
export const nowInTz = (timezone) => moment().utcOffset(timezone || DEFAULT_TIMEZONE);
