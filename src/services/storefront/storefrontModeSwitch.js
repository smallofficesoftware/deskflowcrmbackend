import { Op } from "sequelize";
import { contactModel } from "../../models/activities/contactModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// Mode-switch edge case (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P3/
// Q3(d)): "when an admin disables a method, the admin is given an explicit
// choice at that moment - keep existing accounts working, or lock them
// out." Only four of the six methods map to a storefront_signup_method
// value at all - email_pin/mobile_pin are a SECOND credential set on top of
// an otp_mobile/otp_email/light/invite identity (see storefrontAuthService.js's
// createOrUpgradeContact - PIN methods never create an account by
// themselves), so disabling a PIN method doesn't orphan anyone: the
// contact's original signup path still works, they'd just need a fresh
// code instead of their PIN. No lock prompt is needed or offered for those
// two.
export const LOCKABLE_METHODS = {
  auth_light_mode_enabled: "light",
  auth_invite_only: "invite",
  auth_mobile_otp_enabled: "otp_mobile",
  auth_email_otp_enabled: "otp_email",
};

/** Which of LOCKABLE_METHODS just flipped true -> false between the old and
 * new config_json. Returns [] if nothing newly disabled. */
export function newlyDisabledMethods(oldConfig, newConfig) {
  const disabled = [];
  for (const settingKey of Object.keys(LOCKABLE_METHODS)) {
    if (oldConfig?.[settingKey] && !newConfig?.[settingKey]) disabled.push(settingKey);
  }
  return disabled;
}

/** For each newly-disabled method, how many contacts originally signed up
 * through it - the count the admin's "keep or lock" prompt shows. */
export async function countAffectedAccounts(tenantDB, company_masters_id, settingKeys) {
  const results = [];
  for (const settingKey of settingKeys) {
    const signupMethod = LOCKABLE_METHODS[settingKey];
    const count = await contactModel(tenantDB).count({
      where: { company_masters_id, storefront_signup_method: signupMethod, isDelete: 0 },
    });
    if (count > 0) results.push({ setting: settingKey, method: signupMethod, count });
  }
  return results;
}

/** Applies the admin's per-method choice. lockDecisions is
 * { [settingKey]: "lock" | "keep" } - only "lock" entries do anything (see
 * the migration's own comment: "keep" needs no extra state, the account
 * just keeps working once/if the method comes back). Appends to, never
 * overwrites, each contact's existing storefront_locked_methods list. */
export async function applyLockDecisions(tenantDB, company_masters_id, lockDecisions) {
  for (const [settingKey, decision] of Object.entries(lockDecisions || {})) {
    if (decision !== "lock") continue;
    const signupMethod = LOCKABLE_METHODS[settingKey];
    if (!signupMethod) continue;

    const contacts = await contactModel(tenantDB).findAll({
      where: { company_masters_id, storefront_signup_method: signupMethod, isDelete: 0 },
    });
    for (const contact of contacts) {
      const existing = (contact.storefront_locked_methods || "").split(",").filter(Boolean);
      if (existing.includes(signupMethod)) continue;
      await contact.update({ storefront_locked_methods: [...existing, signupMethod].join(",") });
    }
  }
}

/** Checked at the top of each lockable method's login function (after the
 * company-wide enabled check, for an EXISTING contact only - a brand-new
 * signup can't be locked yet). */
export function isMethodLocked(contact, methodKey) {
  return (contact?.storefront_locked_methods || "").split(",").includes(methodKey);
}

const METHOD_LABELS = { light: "No-verification", invite: "Invite-only", otp_mobile: "Mobile OTP", otp_email: "Email OTP" };

/** POST /storefront/locked-accounts/get - CRM admin listing (staff-authed,
 * same convention as settings/get) of every contact with at least one
 * locked method, so the settings page can offer an unlock action. There
 * was no way back from a lock before this - the admin could only lock,
 * never reverse it short of DB intervention. */
export const getLockedAccounts = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const contacts = await contactModel(req.tenantDB).findAll({
      where: { company_masters_id, isDelete: 0, storefront_locked_methods: { [Op.ne]: null } },
      attributes: ["id", "person_name", "mobile_number", "email_id", "storefront_locked_methods"],
      raw: true,
    });

    const items = contacts
      .map((c) => ({
        id: c.id,
        person_name: c.person_name,
        mobile_number: c.mobile_number,
        email_id: c.email_id,
        locked_methods: (c.storefront_locked_methods || "").split(",").filter(Boolean).map((m) => ({ method: m, label: METHOD_LABELS[m] || m })),
      }))
      .filter((c) => c.locked_methods.length > 0);

    return resSuccess({ data: { items } });
  } catch (error) {
    return resError({ developer_msg: `getLockedAccounts failed: ${error}` });
  }
};

/** POST /storefront/locked-accounts/unlock { contact_id, method } - method
 * is one of 'light'|'invite'|'otp_mobile'|'otp_email', or 'all' to clear
 * every lock on that contact in one go. */
export const unlockStorefrontAccount = async (req) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return resBadRequest({ developer_msg: "Tenant DB or company context missing" });
    }

    const { contact_id, method } = req.body || {};
    if (!contact_id || !method) return resBadRequest({ developer_msg: "contact_id and method are required" });

    const contact = await contactModel(req.tenantDB).findOne({ where: { id: contact_id, company_masters_id, isDelete: 0 } });
    if (!contact) return resError({ ack_msg: "Contact not found." });

    if (method === "all") {
      await contact.update({ storefront_locked_methods: null });
    } else {
      const remaining = (contact.storefront_locked_methods || "").split(",").filter((m) => m && m !== method);
      await contact.update({ storefront_locked_methods: remaining.length > 0 ? remaining.join(",") : null });
    }

    return resSuccess({ ack_msg: "Unlocked." });
  } catch (error) {
    return resError({ developer_msg: `unlockStorefrontAccount failed: ${error}` });
  }
};
