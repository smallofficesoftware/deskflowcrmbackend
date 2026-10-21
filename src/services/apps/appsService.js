import { getTenantDB } from "../../config/dbManager.js";
import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// Generic, public (no login) app-store status check - plans/2026-10-15-ecommerce-
// b2b-b2c-plan.txt (4.5) and plans/2026-10-08-marketplace-tally-plan.txt (4.1) both
// converge on requireAddon(appCode) for an authenticated CRM route; this is the
// SAME check for a caller with no session (the storefront app resolving a company
// by public slug/qr_code before any login exists - lib/apps.ts's isAppEnabled stub
// in that repo calls this exact endpoint). Resolves company by qr_code the same
// way the existing public online-store endpoints do (onlineStoreService.js), then
// reuses requireAddon.js's own isAppEnabledForCompany - no gating logic duplicated.
export const getAppStatus = async (req) => {
  try {
    const { appCode } = req.params;
    const qr_code = req.query.company;

    if (!appCode) {
      return resBadRequest({ developer_msg: "appCode param is required" });
    }
    if (!qr_code) {
      return resBadRequest({ developer_msg: "company (qr_code) query param is required" });
    }

    const companyData = await companyModel.findOne({
      where: { qr_code, isDelete: 0 },
      attributes: ["id", "a_application_login_id", "qr_code"],
    });
    if (!companyData) {
      return resError({ ack_msg: "Company Not Found", developer_msg: "Company Not Found for provided qr_code" });
    }

    const company_masters_id = companyData.dataValues.id;
    const tenantId = companyData.dataValues.a_application_login_id;
    const tenantDBInfo = await getTenantDB(tenantId, company_masters_id);
    if (!tenantDBInfo || !tenantDBInfo.sequelize) {
      return resError({ ack_msg: "Tenant DB Error", developer_msg: "Unable to resolve tenant DB" });
    }

    const { enabled } = await isAppEnabledForCompany(tenantDBInfo.sequelize, company_masters_id, appCode);

    return resSuccess({ data: { item: { appCode, enabled } } });
  } catch (error) {
    return resError({ developer_msg: `getAppStatus failed: ${error}` });
  }
};
