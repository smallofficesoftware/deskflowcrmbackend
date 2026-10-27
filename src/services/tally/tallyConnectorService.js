import crypto from "crypto";
import { marketplaceAddonConnectorKeysModel } from "../../models/marketplace/marketplaceAddonConnectorKeysModel.js";
import { marketplaceAddonSyncJobsModel } from "../../models/marketplace/marketplaceAddonSyncJobsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const ADDON_CODE = "tally";

// Connector-facing job queue (plans/2026-10-08-marketplace-tally-plan.txt P5b).
// Gated by checkConnectorKey, not a user session - req.connectorKeyRow is set
// by that middleware, req.tenantDB resolved by tenantMiddleware from
// companyCode (no JWT). Generic marketplace_addon_sync_jobs table, filtered
// by addon_code='tally' - this file does not own that table.

/** Connector polls this - returns the oldest queued job (if any) and marks it running. */
export const getNextJob = async (req) => {
  try {
    if (!req.tenantDB) return resBadRequest({ developer_msg: "Tenant DB missing" });
    const company_masters_id = req.connectorKeyRow.company_masters_id;

    const model = marketplaceAddonSyncJobsModel(req.tenantDB);
    const job = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, status: "queued" },
      order: [["id", "ASC"]],
    });

    if (!job) return resSuccess({ data: { item: null } });

    await job.update({ status: "running", picked_at: new Date(), attempt_count: job.attempt_count + 1 });
    return resSuccess({ data: { item: job } });
  } catch (error) {
    return resError({ developer_msg: `getNextJob failed: ${error}` });
  }
};

/** Connector posts the outcome of a job it picked up. */
export const postJobResult = async (req) => {
  try {
    if (!req.tenantDB) return resBadRequest({ developer_msg: "Tenant DB missing" });
    const company_masters_id = req.connectorKeyRow.company_masters_id;
    const { job_id, status, result_json, error_message } = req.body || {};

    if (!job_id || !["done", "failed"].includes(status)) {
      return resBadRequest({ developer_msg: "job_id and status ('done'|'failed') are required" });
    }

    const model = marketplaceAddonSyncJobsModel(req.tenantDB);
    const job = await model.findOne({ where: { id: job_id, company_masters_id, addon_code: ADDON_CODE } });
    if (!job) return resBadRequest({ developer_msg: `Job ${job_id} not found for this company` });

    await job.update({ status, result_json, error_message, completed_at: new Date() });
    return resSuccess({ data: { item: job } });
  } catch (error) {
    return resError({ developer_msg: `postJobResult failed: ${error}` });
  }
};

/** User-session-gated (NOT connector-key) - the CRM web app's Tally settings screen calls
 * this to issue a fresh connector key for the company, shown once. Revokes any prior active
 * key for this addon first - v1 holds one active key per (company, addon), per the plan. */
export const issueConnectorKey = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const model = marketplaceAddonConnectorKeysModel(req.tenantDB);
    await model.update(
      { isActive: 0, revoked_date_time: new Date() },
      { where: { company_masters_id, addon_code: ADDON_CODE, isActive: 1 } }
    );

    const connector_key = crypto.randomBytes(24).toString("hex");
    const row = await model.create({ company_masters_id, addon_code: ADDON_CODE, connector_key });

    return resSuccess({ data: { item: { id: row.id, connector_key, issued_date_time: row.issued_date_time } } });
  } catch (error) {
    return resError({ developer_msg: `issueConnectorKey failed: ${error}` });
  }
};

/** User-session-gated - revoke the company's active Tally connector key. */
export const revokeConnectorKey = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const model = marketplaceAddonConnectorKeysModel(req.tenantDB);
    const [count] = await model.update(
      { isActive: 0, revoked_date_time: new Date() },
      { where: { company_masters_id, addon_code: ADDON_CODE, isActive: 1 } }
    );

    return resSuccess({ data: { revoked: count } });
  } catch (error) {
    return resError({ developer_msg: `revokeConnectorKey failed: ${error}` });
  }
};
