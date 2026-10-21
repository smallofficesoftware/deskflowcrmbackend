import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const ADDON_CODE = "tally";

// First functional slice of the Tally module (plans/2026-10-08-marketplace-
// tally-plan.txt 4.4: "Settings -> mapping -> sync -> log"). Reads/writes the
// GENERIC marketplace_addon_settings table filtered by addon_code='tally' -
// this file does not own that table, it just uses it like any addon would.

export const getTallySettings = async (req) => {
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
    return resError({ developer_msg: `getTallySettings failed: ${error}` });
  }
};

export const saveTallySettings = async (req) => {
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
    return resError({ developer_msg: `saveTallySettings failed: ${error}` });
  }
};
