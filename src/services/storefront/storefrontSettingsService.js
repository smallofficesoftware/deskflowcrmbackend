import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const ADDON_CODE = "ecommerce-storefront";

// First functional slice of the ecommerce storefront addon's CRM admin
// settings page (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P1/4.4).
// Reads/writes the GENERIC marketplace_addon_settings table filtered by
// addon_code='ecommerce-storefront' - same shape as tallySettingsService.js,
// this file does not own that table either, it just uses it like any addon
// would (REVISED 21-10-2026, per the user: no dedicated storefront_payment_
// settings/storefront_auth_settings tables - see plan 4.2a/4.2c/section 8).

export const getStorefrontSettings = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const model = marketplaceAddonSettingsModel(req.tenantDB);
    const row = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
      raw: true,
    });

    return resSuccess({ data: { item: row || null } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontSettings failed: ${error}` });
  }
};

export const saveStorefrontSettings = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const { connection_mode, direct_url_host, direct_url_port, config_json } = req.body || {};
    const model = marketplaceAddonSettingsModel(req.tenantDB);

    const existing = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
    });

    const fields = {
      company_masters_id,
      addon_code: ADDON_CODE,
      connection_mode,
      direct_url_host,
      direct_url_port,
      config_json,
      modified_date: new Date(),
    };

    const row = existing ? await existing.update(fields) : await model.create(fields);

    return resSuccess({ data: { item: row } });
  } catch (error) {
    return resError({ developer_msg: `saveStorefrontSettings failed: ${error}` });
  }
};
