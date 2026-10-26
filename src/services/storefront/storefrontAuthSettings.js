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
  // false = anonymous visitors can only reach /account (login); every other
  // storefront page redirects there until they have a valid session.
  public_browsing_enabled: true,
  // Not auth-specific, but the same config_json row - storefrontCatalogService.js's
  // applyDefaultPriceList used to read this via its own separate query; checkout
  // (P4) needs it too, so it's read once here instead of twice.
  default_price_list_id: null,
  // P4 payment settings (23-10-2026, per the user: settings UI now, real
  // payment wiring built right after) - same config_json blob, no new keys
  // table. razorpay_key_secret never leaves the server (storefrontPaymentService.js
  // only ever reads it server-side to call Razorpay's own API / verify its
  // signature - never returned to any client, CRM or storefront).
  // Checkout payment options. cash = no gateway: the order is saved as a plain
  // draft and the team collects payment themselves (same draft path approval
  // mode uses).
  payment_razorpay_enabled: true,
  payment_cash_enabled: false,
  // Sales Order stage a cash order lands in (a real, numbered order - unlike
  // approval mode's plain draft).
  cash_stage_status_id: null,
  // Bank transfer: no gateway either. Details are shown to the customer after
  // they place the order; the order lands in bank_stage_status_id.
  payment_bank_enabled: false,
  bank_stage_status_id: null,
  bank_name: "",
  bank_account_holder: "",
  bank_account_number: "",
  bank_ifsc: "",
  bank_instructions: "",
  // UPI: no gateway. The customer pays to upi_id from their own UPI app (the
  // storefront builds the upi:// link); the order lands in upi_stage_status_id.
  payment_upi_enabled: false,
  upi_stage_status_id: null,
  upi_id: "",
  upi_payee_name: "",
  upi_instructions: "",
  razorpay_key_id: "",
  razorpay_key_secret: "",
  paid_stage_status_id: null,
  // P5 B2B settings (24-10-2026) - same config_json blob, no new keys table.
  // credit_limit_action: what happens when a logged-in B2B checkout would
  // push a contact over their contact_masters.credit_limit (per the user:
  // admin-configurable, not hardcoded - see storefrontCheckoutService.js's
  // checkCreditLimit). approval_mode_enabled: logged-in checkout creates a
  // plain draft cart (no payment step) instead of going to Razorpay - same
  // draft mechanism the old online-store module's own orderType "draft"
  // already uses, not a new status machine. stock_check_mode: 'derived'
  // (P4's existing ledger-only calc, unchanged default) or 'reserved' (holds
  // stock against OTHER concurrent storefront checkouts too - see
  // storefrontCheckoutService.js's reserveStockForCheckout).
  credit_limit_action: "warn",
  approval_mode_enabled: false,
  stock_check_mode: "derived",
  // Theme accent color (24-10-2026, per the user: "we need color option for
  // the theme also as of now it is red or pink") - the ported Pharmacy CSS
  // hardcodes its own red/pink accent (buttons, prices, active-menu
  // underline) throughout thousands of rules with literal hex values, not
  // CSS variables, so this can't be swapped by editing the stylesheet itself
  // without breaking the "byte-identical ported CSS" approach. Instead the
  // storefront injects a small override <style> block using this value -
  // see storefront's app/layout.tsx. Default matches the theme's own current
  // red so turning this on doesn't change anything until an admin picks a
  // different color.
  theme_accent_color: "#ff0000",
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
