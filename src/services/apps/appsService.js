import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { resolveCompanyBySlug } from "../storefront/storefrontCompanyResolver.js";

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

    const resolved = await resolveCompanyBySlug(qr_code);
    if (!resolved) {
      return resError({ ack_msg: "Company Not Found", developer_msg: "Company Not Found for provided qr_code" });
    }

    const { enabled } = await isAppEnabledForCompany(resolved.tenantDB, resolved.company_masters_id, appCode);

    return resSuccess({ data: { item: { appCode, enabled } } });
  } catch (error) {
    return resError({ developer_msg: `getAppStatus failed: ${error}` });
  }
};
