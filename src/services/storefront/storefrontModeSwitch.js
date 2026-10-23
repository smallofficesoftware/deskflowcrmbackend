import { contactModel } from "../../models/activities/contactModel.js";

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
