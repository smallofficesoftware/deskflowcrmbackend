import { marketplaceAddonSettingsModel } from "../../models/marketplace/marketplaceAddonSettingsModel.js";

// Reads the six Q3 auth-method toggles + Q6 guest-checkout toggle out of the
// GENERIC marketplace_addon_settings.config_json (addon_code='ecommerce-
// storefront') - plan 4.2a, REVISED 21-10-2026: no dedicated
// storefront_auth_settings table, these are just keys in the same JSON blob
// the admin settings page (storefrontSettingsService.js) already reads/
// writes wholesale via config_json. This is the read-side default-filling
// helper every auth flow needs; the admin UI for toggling them individually
// is a separate, not-yet-built frontend slice (saveStorefrontSettings
// already accepts an arbitrary config_json, so no backend change is needed
// for that later).
const ADDON_CODE = "ecommerce-storefront";

const DEFAULTS = {
  auth_email_pin_enabled: false,
  auth_mobile_pin_enabled: false,
  auth_mobile_otp_enabled: false,
  auth_email_otp_enabled: false,
  auth_light_mode_enabled: false,
  auth_invite_only: false,
  guest_checkout_enabled: true,
};

export const getStorefrontAuthSettings = async (tenantDB, company_masters_id) => {
  const row = await marketplaceAddonSettingsModel(tenantDB).findOne({
    where: { company_masters_id, addon_code: ADDON_CODE, isDelete: 0 },
    attributes: ["config_json"],
    raw: true,
  });

  // With raw:true, mysql2 hands back this JSON column as a plain string, not
  // an auto-parsed object (confirmed live - storefrontSettingsService.js's
  // own getStorefrontSettings has this same latent gap, just never exercised
  // against real config_json content until now). Parse defensively rather
  // than assuming either shape.
  let parsed = row?.config_json;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }

  return { ...DEFAULTS, ...(parsed || {}) };
};
