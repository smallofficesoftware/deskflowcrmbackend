import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";
import { applyLockDecisions, countAffectedAccounts, newlyDisabledMethods } from "./storefrontModeSwitch.js";
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

    // With raw:true, mysql2 hands back config_json as a plain string, not an
    // auto-parsed object (same latent bug found and fixed in
    // storefrontAuthSettings.js - this read path never exercised the JSON
    // column with real content until the auth-toggle UI needed it).
    if (row && typeof row.config_json === "string") {
      try {
        row.config_json = JSON.parse(row.config_json);
      } catch {
        row.config_json = {};
      }
    }

    return resSuccess({ data: { item: row || null } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontSettings failed: ${error}` });
  }
};

/** Mode-switch edge case (Q3(d)): before actually saving a config_json that
 * newly disables email_light_mode_enabled/auth_invite_only/auth_mobile_
 * otp_enabled/auth_email_otp_enabled (the four "lockable" methods - see
 * storefrontModeSwitch.js for why the two PIN methods are excluded), check
 * whether any existing accounts signed up through that method. If so, and
 * the caller hasn't already answered (lock_decisions), save is REFUSED and
 * the affected counts are returned instead - the CRM settings UI shows a
 * "keep or lock" prompt per affected method, then resubmits with
 * lock_decisions filled in. Toggling anything else (including PIN methods,
 * or disabling-then-reenabling in the same save) skips this entirely. */
export const saveStorefrontSettings = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const { connection_mode, direct_url_host, direct_url_port, config_json, lock_decisions } = req.body || {};
    const model = marketplaceAddonSettingsModel(req.tenantDB);

    const existing = await model.findOne({
      where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
    });

    // config_json comes back as a JSON STRING even on a non-raw instance read
    // (confirmed live - not just the raw:true case fixed elsewhere) - parse
    // defensively or every key compares as undefined and nothing ever looks
    // "newly disabled".
    let oldConfig = existing?.config_json;
    if (typeof oldConfig === "string") {
      try {
        oldConfig = JSON.parse(oldConfig);
      } catch {
        oldConfig = {};
      }
    }

    const disabledNow = newlyDisabledMethods(oldConfig || {}, config_json || {});
    if (disabledNow.length > 0 && !lock_decisions) {
      const affected = await countAffectedAccounts(req.tenantDB, company_masters_id, disabledNow);
      if (affected.length > 0) {
        return resSuccess({ ack_msg: "Confirm how to handle existing accounts before saving.", data: { needs_decision: true, affected } });
      }
    }

    if (lock_decisions) {
      await applyLockDecisions(req.tenantDB, company_masters_id, lock_decisions);
    }

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
