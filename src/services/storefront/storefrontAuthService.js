import { contactModel } from "../../models/activities/contactModel.js";
import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";
import { ClaudeOfficeWhatsAppOtp } from "../company_setup/thirdPartyIntegrationService.js";
import { createOtpChallenge, verifyOtpChallenge } from "./storefrontOtp.js";
import { sendStorefrontOtpEmail } from "./storefrontMailer.js";
import { createSessionToken } from "./storefrontSession.js";
import { hashPin, isValidPinFormat, verifyPin } from "./storefrontPin.js";
import { getStorefrontAuthSettings } from "./storefrontAuthSettings.js";
import { isMethodLocked } from "./storefrontModeSwitch.js";
import { resolveCompanyBySlug } from "./storefrontCompanyResolver.js";
import { normalizeToTenDigit, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// Customer accounts for the ecommerce storefront (plans/2026-10-15-ecommerce-
// b2b-b2c-plan.txt, P3 - Q3's six independently-toggleable auth methods +
// Q3's invite-only signup restriction).
//
// REVISED 23-10-2026, per the user: a storefront customer IS a contact, not
// a separate identity. The old online-store module (onlineStoreService.js)
// already finds-or-creates a contact_masters row by mobile number for this
// exact purpose, and contact_masters already has address/city/state/pincode
// fields - a separate storefront_customers/storefront_addresses pair (built,
// tested live, then dropped this same day) was the wrong shape. Auth state
// now lives directly on contact_masters as five storefront_-prefixed
// columns (migration 20261023100000) - see that migration's own comment for
// the full reasoning, including why storefront_signup_method (non-null),
// not row existence, is the "has a storefront account" signal.
//
// Every function here takes `req` directly and returns resSuccess/resError,
// same convention as storefrontCatalogService.js - thin controllers call
// these via callServiceMethod.
//
// NOT wrapped in requireAddon() - that middleware assumes req.user.companyId
// (an authenticated CRM staff member), which doesn't exist for an anonymous
// storefront customer. Each function does its own inline
// resolveCompanyBySlug() + isAppEnabledForCompany() check instead.
const ADDON_CODE = "ecommerce-storefront";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function resolveAndGate(companySlug) {
  const resolved = await resolveCompanyBySlug(companySlug);
  if (!resolved) return { error: resError({ ack_msg: "Store not found" }) };

  const { enabled } = await isAppEnabledForCompany(resolved.tenantDB, resolved.company_masters_id, ADDON_CODE);
  if (!enabled) return { error: resError({ ack_msg: "This store's online ordering is not enabled." }) };

  return { resolved };
}

/** Normalizes identifier to the lookup value used for storage/matching -
 * mobile stored as the codebase-wide "91XXXXXXXXXX" form (same as
 * contact_masters.mobile_number, see normalizeToTenDigit's other callers),
 * email as trimmed-lowercase. Returns null if the identifier is invalid for
 * its channel. */
function lookupValueFor(channel, identifier) {
  if (channel === "mobile") return normalizeToTenDigit(identifier);
  if (channel === "email") {
    const email = String(identifier ?? "").trim().toLowerCase();
    return EMAIL_REGEX.test(email) ? email : null;
  }
  return null;
}

async function findContact(tenantDB, company_masters_id, channel, lookupValue) {
  const where = { company_masters_id, isDelete: 0 };
  where[channel === "mobile" ? "mobile_number" : "email_id"] = lookupValue;
  return contactModel(tenantDB).findOne({ where });
}

/** A contact "has a storefront account" once it's been through any
 * signup/login flow below at least once - NOT just because the
 * contact_masters row exists (it may be an old sales lead who's never
 * touched the storefront). */
const hasStorefrontAccount = (contact) => !!contact?.storefront_signup_method;

/** Invite-only (Q3 method 6) is a SIGNUP restriction only - a contact that
 * already has a storefront account always logs in via whichever method is
 * enabled, regardless of this flag. Only consulted before FIRST establishing
 * one. Requires a pre-existing CRM contact row with storefront_invited=1 -
 * there is nothing to "invite" if no such contact exists at all. */
const canSignUp = (settings, contact) => !settings.auth_invite_only || !!contact?.storefront_invited;

/** Creates a brand-new contact_masters row for a storefront-only signup
 * (mirrors the old online-store module's own create-shape - person_name
 * defaults to "Guest", same as onlineStoreService.js), or upgrades an
 * existing CRM contact that's never used the storefront before by stamping
 * signup_method on it. Either way, the row is a real contact from here on. */
async function createOrUpgradeContact(tenantDB, { company_masters_id, channel, lookupValue, contact, signupMethod, extra = {} }) {
  if (contact) {
    await contact.update({ storefront_signup_method: contact.storefront_signup_method || signupMethod, ...extra });
    return contact;
  }
  const fields = {
    company_masters_id,
    person_name: "Guest",
    contact_status: -1,
    storefront_signup_method: signupMethod,
    ...extra,
  };
  fields[channel === "mobile" ? "mobile_number" : "email_id"] = lookupValue;
  return contactModel(tenantDB).create(fields);
}

// contact_masters carries the FULL internal CRM schema (custom cntc_column_*
// fields, Miracle sync columns, etc.) - a storefront customer's own profile
// should see a safe, stable subset, not the whole row (also keeps this API
// from silently changing shape every time an unrelated CRM field is added).
const PUBLIC_CONTACT_FIELDS = [
  "id", "person_name", "company_name", "mobile_number", "email_id",
  "address", "shipping_address", "city", "state", "pincode", "area", "country",
  "storefront_is_verified_mobile", "storefront_is_verified_email",
  "storefront_signup_method", "storefront_last_login_date",
];

function publicContactShape(contact) {
  const plain = contact.toJSON ? contact.toJSON() : contact;
  return Object.fromEntries(PUBLIC_CONTACT_FIELDS.map((field) => [field, plain[field]]));
}

/** GET /storefront/:companySlug/auth/config - public, no secrets (just which
 * of Q3's six methods + Q6 guest checkout are on) - the frontend needs this
 * to render only the login/signup methods the company has actually enabled,
 * per the plan's own exit criteria ("auth screen that shows only the
 * methods the company has enabled"). */
export const getStorefrontAuthConfig = async (req) => {
  try {
    const { companySlug } = req.params;
    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    // Flat, not { item: settings } - every sibling function in this file (otp/verify,
    // pin-login, etc.) returns its fields directly under `data`, not wrapped in an
    // `item` key (that's the catalog service's convention, a different file/feature).
    const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
    return resSuccess({ data: settings });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontAuthConfig failed: ${error}` });
  }
};

/** POST /storefront/:companySlug/auth/otp/request { channel, identifier }
 * Used both for first-time PIN-method verification (1/2) and every-time OTP
 * login (3/4) - the caller doesn't need to say which, this just gates the
 * channel being enabled at all and (for a contact with no storefront
 * account yet) invite-only. */
export const requestStorefrontOtp = async (req) => {
  try {
    const { companySlug } = req.params;
    const { channel, identifier } = req.body || {};
    if (!["mobile", "email"].includes(channel)) return resBadRequest({ developer_msg: "channel must be 'mobile' or 'email'" });

    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
    const channelEnabled = channel === "mobile"
      ? settings.auth_mobile_pin_enabled || settings.auth_mobile_otp_enabled
      : settings.auth_email_pin_enabled || settings.auth_email_otp_enabled;
    if (!channelEnabled) return resError({ ack_msg: "This store doesn't support that login method." });

    const lookupValue = lookupValueFor(channel, identifier);
    if (!lookupValue) return resError({ ack_msg: channel === "mobile" ? "Enter a valid mobile number." : "Enter a valid email address." });

    const contact = await findContact(resolved.tenantDB, resolved.company_masters_id, channel, lookupValue);
    if (!hasStorefrontAccount(contact) && !canSignUp(settings, contact)) {
      return resError({ ack_msg: "This store is invite-only. Contact the seller for access." });
    }
    if (contact && isMethodLocked(contact, channel === "mobile" ? "otp_mobile" : "otp_email")) {
      return resError({ ack_msg: "This login method has been disabled for your account. Contact the seller for help." });
    }

    const { code, token } = createOtpChallenge(identifier);

    if (channel === "mobile") {
      const tenDigit = normalizeToTenDigit(identifier);
      const sent = await ClaudeOfficeWhatsAppOtp(code, tenDigit);
      if (sent?.ack !== 1) return resError({ ack_msg: "Couldn't send the code over WhatsApp. Check the number and try again." });
    } else {
      const sent = await sendStorefrontOtpEmail(lookupValue, code, resolved.a_application_login_id);
      if (!sent) return resError({ ack_msg: "Couldn't send the code by email. Check the address and try again." });
    }

    return resSuccess({ ack_msg: channel === "mobile" ? "A code was sent on WhatsApp." : "A code was sent by email.", data: { token } });
  } catch (error) {
    return resError({ developer_msg: `requestStorefrontOtp failed: ${error}` });
  }
};

/** POST /storefront/:companySlug/auth/otp/verify { channel, identifier, token, code }
 * Finds-or-upgrades-or-creates the contact_masters row, issues a session,
 * and tells the frontend whether to show a "set your PIN" step next
 * (needs_pin_setup - only relevant when a PIN method is enabled for this
 * channel). */
export const verifyStorefrontOtp = async (req) => {
  try {
    const { companySlug } = req.params;
    const { channel, identifier, token, code } = req.body || {};
    if (!["mobile", "email"].includes(channel)) return resBadRequest({ developer_msg: "channel must be 'mobile' or 'email'" });

    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const verified = verifyOtpChallenge(token, identifier, code);
    if (!verified.ok) return resError({ ack_msg: verified.error, data: { token: verified.token || null } });

    const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
    const lookupValue = lookupValueFor(channel, identifier);
    if (!lookupValue) return resError({ ack_msg: "Invalid identifier." });

    let contact = await findContact(resolved.tenantDB, resolved.company_masters_id, channel, lookupValue);
    if (!hasStorefrontAccount(contact) && !canSignUp(settings, contact)) {
      return resError({ ack_msg: "This store is invite-only. Contact the seller for access." });
    }

    const verifiedField = channel === "mobile" ? "storefront_is_verified_mobile" : "storefront_is_verified_email";
    contact = await createOrUpgradeContact(resolved.tenantDB, {
      company_masters_id: resolved.company_masters_id,
      channel,
      lookupValue,
      contact,
      signupMethod: `otp_${channel}`,
      extra: { [verifiedField]: 1, storefront_last_login_date: new Date() },
    });

    const pinEnabled = channel === "mobile" ? settings.auth_mobile_pin_enabled : settings.auth_email_pin_enabled;
    const needsPinSetup = !!pinEnabled && !contact.storefront_pin_hash;

    const sessionToken = createSessionToken(contact, resolved.a_application_login_id);
    return resSuccess({ data: { token: sessionToken, needs_pin_setup: needsPinSetup, customer: publicContactShape(contact) } });
  } catch (error) {
    return resError({ developer_msg: `verifyStorefrontOtp failed: ${error}` });
  }
};

/** POST /storefront/me/pin { pin } - protected (requireStorefrontSession).
 * Sets/replaces the logged-in customer's PIN after they've verified via OTP. */
export const setStorefrontPin = async (req) => {
  try {
    const { pin } = req.body || {};
    if (!isValidPinFormat(pin)) return resBadRequest({ developer_msg: "pin must be 4-6 digits" });

    const { contact_master_id, company_masters_id } = req.storefrontSession;
    const contact = await contactModel(req.tenantDB).findOne({
      where: { id: contact_master_id, company_masters_id, isDelete: 0 },
    });
    if (!contact) return resError({ ack_msg: "Account not found." });

    await contact.update({ storefront_pin_hash: hashPin(pin) });
    return resSuccess({ ack_msg: "PIN set." });
  } catch (error) {
    return resError({ developer_msg: `setStorefrontPin failed: ${error}` });
  }
};

/** POST /storefront/:companySlug/auth/pin-login { channel, identifier, pin }
 * The "system auto-decides" behaviour (Q3) is realized client-side: the
 * frontend tries this first, and on the "PIN not set" error falls back to
 * the OTP request/verify pair above - no server-side method-picker needed. */
export const storefrontPinLogin = async (req) => {
  try {
    const { companySlug } = req.params;
    const { channel, identifier, pin } = req.body || {};
    if (!["mobile", "email"].includes(channel)) return resBadRequest({ developer_msg: "channel must be 'mobile' or 'email'" });

    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
    const pinEnabled = channel === "mobile" ? settings.auth_mobile_pin_enabled : settings.auth_email_pin_enabled;
    if (!pinEnabled) return resError({ ack_msg: "This store doesn't support PIN login for that method." });

    const lookupValue = lookupValueFor(channel, identifier);
    if (!lookupValue) return resError({ ack_msg: "Invalid identifier." });

    const contact = await findContact(resolved.tenantDB, resolved.company_masters_id, channel, lookupValue);
    if (!contact?.storefront_pin_hash) return resError({ ack_msg: "PIN not set. Log in with a one-time code instead.", data: { needs_otp: true } });
    if (!verifyPin(pin, contact.storefront_pin_hash)) return resError({ ack_msg: "Incorrect PIN." });

    await contact.update({ storefront_last_login_date: new Date() });
    const sessionToken = createSessionToken(contact, resolved.a_application_login_id);
    return resSuccess({ data: { token: sessionToken, customer: publicContactShape(contact) } });
  } catch (error) {
    return resError({ developer_msg: `storefrontPinLogin failed: ${error}` });
  }
};

/** POST /storefront/:companySlug/auth/light-login { mobile_number }
 * Q3 method 5 - no OTP/PIN at all, trusted order-placing entry. */
export const storefrontLightLogin = async (req) => {
  try {
    const { companySlug } = req.params;
    const { mobile_number } = req.body || {};

    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
    if (!settings.auth_light_mode_enabled) return resError({ ack_msg: "This store requires verification to sign in." });

    const lookupValue = lookupValueFor("mobile", mobile_number);
    if (!lookupValue) return resError({ ack_msg: "Enter a valid mobile number." });

    let contact = await findContact(resolved.tenantDB, resolved.company_masters_id, "mobile", lookupValue);
    if (!hasStorefrontAccount(contact) && !canSignUp(settings, contact)) {
      return resError({ ack_msg: "This store is invite-only. Contact the seller for access." });
    }
    if (contact && isMethodLocked(contact, "light")) {
      return resError({ ack_msg: "This login method has been disabled for your account. Contact the seller for help." });
    }

    contact = await createOrUpgradeContact(resolved.tenantDB, {
      company_masters_id: resolved.company_masters_id,
      channel: "mobile",
      lookupValue,
      contact,
      signupMethod: "light",
      extra: { storefront_last_login_date: new Date() },
    });

    const sessionToken = createSessionToken(contact, resolved.a_application_login_id);
    return resSuccess({ data: { token: sessionToken, customer: publicContactShape(contact) } });
  } catch (error) {
    return resError({ developer_msg: `storefrontLightLogin failed: ${error}` });
  }
};

/** POST /storefront/:companySlug/auth/invite-login { mobile_number }
 * Q3 method 6 - only for contacts the admin has pre-allowlisted
 * (contact_masters.storefront_invited=1); no OTP/PIN, trusted by invite. */
export const storefrontInviteLogin = async (req) => {
  try {
    const { companySlug } = req.params;
    const { mobile_number } = req.body || {};

    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
    if (!settings.auth_invite_only) return resError({ ack_msg: "Invite-only login is not enabled for this store." });

    const lookupValue = lookupValueFor("mobile", mobile_number);
    if (!lookupValue) return resError({ ack_msg: "Enter a valid mobile number." });

    let contact = await findContact(resolved.tenantDB, resolved.company_masters_id, "mobile", lookupValue);
    if (!hasStorefrontAccount(contact) && !contact?.storefront_invited) {
      return resError({ ack_msg: "This mobile number hasn't been invited." });
    }
    if (contact && isMethodLocked(contact, "invite")) {
      return resError({ ack_msg: "This login method has been disabled for your account. Contact the seller for help." });
    }

    contact = await createOrUpgradeContact(resolved.tenantDB, {
      company_masters_id: resolved.company_masters_id,
      channel: "mobile",
      lookupValue,
      contact,
      signupMethod: "invite",
      extra: { storefront_is_verified_mobile: 1, storefront_last_login_date: new Date() },
    });

    const sessionToken = createSessionToken(contact, resolved.a_application_login_id);
    return resSuccess({ data: { token: sessionToken, customer: publicContactShape(contact) } });
  } catch (error) {
    return resError({ developer_msg: `storefrontInviteLogin failed: ${error}` });
  }
};

/** GET /storefront/me - protected (requireStorefrontSession). */
export const getStorefrontMe = async (req) => {
  try {
    const { contact_master_id, company_masters_id } = req.storefrontSession;
    const contact = await contactModel(req.tenantDB).findOne({
      where: { id: contact_master_id, company_masters_id, isDelete: 0 },
      raw: true,
    });
    if (!contact) return resError({ ack_msg: "Account not found." });

    return resSuccess({ data: { item: publicContactShape(contact) } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontMe failed: ${error}` });
  }
};

// Only these four - person_name, address, shipping_address, pincode - are
// safe for a storefront customer to write directly: they're free text on
// contact_masters. country/state/city/area are NOT free text despite the
// Sequelize model's STRING declaration - SHOW COLUMNS confirms they're all
// int(11) foreign keys (into country_masters etc.), and there's no public
// endpoint yet to list those master values for a dropdown, so accepting
// arbitrary text for them would either silently corrupt the FK or fail.
// Deferred, not built - structured address editing needs that lookup first.
const EDITABLE_PROFILE_FIELDS = ["person_name", "address", "shipping_address", "pincode"];

/** PUT /storefront/me - protected (requireStorefrontSession). */
export const updateStorefrontMe = async (req) => {
  try {
    const { contact_master_id, company_masters_id } = req.storefrontSession;
    const contact = await contactModel(req.tenantDB).findOne({
      where: { id: contact_master_id, company_masters_id, isDelete: 0 },
    });
    if (!contact) return resError({ ack_msg: "Account not found." });

    const body = req.body || {};
    const updates = {};
    for (const field of EDITABLE_PROFILE_FIELDS) {
      if (body[field] === undefined) continue;
      updates[field] = String(body[field] ?? "").trim();
    }
    if (updates.person_name === "") return resBadRequest({ developer_msg: "person_name cannot be empty" });

    await contact.update(updates);
    return resSuccess({ data: { item: publicContactShape(contact) } });
  } catch (error) {
    return resError({ developer_msg: `updateStorefrontMe failed: ${error}` });
  }
};
