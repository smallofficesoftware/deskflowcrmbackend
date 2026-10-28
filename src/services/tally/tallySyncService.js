import { Op } from "sequelize";
import { marketplaceAddonSyncJobsModel } from "../../models/marketplace/marketplaceAddonSyncJobsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyId } from "./tallyAuthHelper.js";

const ADDON_CODE = "tally";

// CRM-side half of the connector job queue (plans/2026-10-08-marketplace-tally-
// plan.txt P5b / 4.3): the Tally settings screen asks for a fresh pull of
// Tally's masters, polls the job, and shows the names in the mapping dropdowns;
// the same screen lists recent jobs as the sync log. The connector side
// (tallyConnectorService.js getNextJob/postJobResult) is unchanged - it just
// finds these jobs in the same marketplace_addon_sync_jobs table.

// Only reads the screen is allowed to request. push_* jobs are created by the
// sync code itself, never by a button in the settings screen.
const PULL_JOB_TYPES = ["pull_ledgers", "pull_stock_items", "pull_voucher_types"];

// A job the connector picked up but never reported back (crashed/offline)
// would otherwise block new requests for the same type forever.
const STALE_AFTER_MS = 5 * 60 * 1000;

const MAX_OPTIONS = 5000;

/** Tally's XML->JSON records carry the name in different places depending on the master type
 *  and release (attribute, plain element, or LANGUAGENAME.NAME.LIST). Take the first one found. */
const recordName = (record) => {
  if (!record || typeof record !== "object") return null;
  const direct = record["@_NAME"] ?? record.NAME ?? record.name;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const lang = record.LANGUAGENAME?.["NAME.LIST"]?.NAME ?? record["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
  const first = Array.isArray(lang) ? lang[0] : lang;
  if (typeof first === "string" && first.trim()) return first.trim();
  if (typeof first?.["#text"] === "string") return first["#text"].trim();
  return null;
};

/** result_json can reach us as a real array or (double-encoded) a JSON string. */
const toRecords = (raw) => {
  let value = raw;
  for (let i = 0; i < 2 && typeof value === "string"; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
};

/** Ask the connector for a fresh pull. Reuses a pending job of the same type instead of stacking duplicates. */
export const requestTallyPull = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }
    const { job_type } = req.body || {};
    if (!PULL_JOB_TYPES.includes(job_type)) {
      return resBadRequest({ developer_msg: `job_type must be one of ${PULL_JOB_TYPES.join(", ")}` });
    }

    const model = marketplaceAddonSyncJobsModel(req.tenantDB);
    const pending = await model.findOne({
      where: {
        company_masters_id,
        addon_code: ADDON_CODE,
        job_type,
        status: { [Op.in]: ["queued", "running"] },
        created_date_time: { [Op.gt]: new Date(Date.now() - STALE_AFTER_MS) },
      },
      order: [["id", "DESC"]],
    });
    if (pending) return resSuccess({ data: { item: { id: pending.id, status: pending.status, reused: true } } });

    // payload_json is a Sequelize JSON column: pass a plain object, never JSON.stringify it
    // (double-encodes - see the 27-10-2026 note in the plan).
    const job = await model.create({
      company_masters_id,
      addon_code: ADDON_CODE,
      job_type,
      direction: "pull",
      status: "queued",
      payload_json: {},
    });
    return resSuccess({ data: { item: { id: job.id, status: job.status, reused: false } } });
  } catch (error) {
    return resError({ developer_msg: `requestTallyPull failed: ${error}` });
  }
};

/** Status of one requested pull; once done, the Tally names (de-duplicated, sorted) for the dropdowns. */
export const getTallyPullStatus = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }
    const { job_id } = req.body || {};
    if (!job_id) return resBadRequest({ developer_msg: "job_id is required" });

    const job = await marketplaceAddonSyncJobsModel(req.tenantDB).findOne({
      where: { id: job_id, company_masters_id, addon_code: ADDON_CODE, job_type: { [Op.in]: PULL_JOB_TYPES } },
    });
    if (!job) return resBadRequest({ developer_msg: `Job ${job_id} not found for this company` });

    const item = { id: job.id, job_type: job.job_type, status: job.status, error_message: job.error_message || null, names: [] };
    if (job.status === "done") {
      const records = toRecords(job.result_json);
      const names = [...new Set(records.map(recordName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      item.total_records = records.length;
      item.names = names.slice(0, MAX_OPTIONS);
    }
    return resSuccess({ data: { item } });
  } catch (error) {
    return resError({ developer_msg: `getTallyPullStatus failed: ${error}` });
  }
};

/** Recent jobs for the sync log - everything except the (large) result_json. */
export const listTallySyncLog = async (req) => {
  try {
    const company_masters_id = resolveCompanyId(req);
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }
    const limit = Math.min(Math.max(Number(req.body?.limit) || 100, 1), 500);

    const items = await marketplaceAddonSyncJobsModel(req.tenantDB).findAll({
      where: { company_masters_id, addon_code: ADDON_CODE },
      attributes: ["id", "job_type", "entity_type", "entity_id", "direction", "status", "error_message", "attempt_count", "picked_at", "completed_at", "created_date_time"],
      order: [["id", "DESC"]],
      limit,
      raw: true,
    });
    return resSuccess({ data: { items } });
  } catch (error) {
    return resError({ developer_msg: `listTallySyncLog failed: ${error}` });
  }
};
