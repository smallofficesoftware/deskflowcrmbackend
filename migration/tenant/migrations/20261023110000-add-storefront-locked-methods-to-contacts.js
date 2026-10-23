/**
 * Migration Name: add-storefront-locked-methods-to-contacts
 * Database Type: TENANT
 * Created: 23/10/2026
 *
 * Mode-switch edge case (Q3(d)): "when an admin disables a method, the
 * admin is given an explicit choice - keep existing accounts working, or
 * lock them out." Per the user (23-10-2026): a lock is scoped to that ONE
 * method only - a locked contact can still log in via any OTHER method the
 * company has enabled, so this is a per-method denylist, not an account-wide
 * suspension flag.
 *
 * Comma-separated method keys ('light' | 'invite' | 'otp_mobile' |
 * 'otp_email' - see storefrontModeSwitch.js). NOTE: while a method stays
 * disabled, this flag has NO observable effect at all - the company-wide
 * settings check in storefrontAuthService.js already blocks everyone from
 * that method regardless of lock state. This flag only matters if the
 * admin later RE-ENABLES the method: an unlocked contact resumes working
 * immediately (that's what "keep" means - do nothing extra), a locked one
 * stays denied until an admin clears it. That's the entire point of the
 * choice - "keep" vs "lock" are otherwise indistinguishable while the
 * method stays off.
 */

const columnExists = async (queryInterface, table, column) => {
  const columns = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(columns, column);
};

export const up = async (queryInterface, Sequelize) => {
  if (await columnExists(queryInterface, "contact_masters", "storefront_locked_methods")) return;
  await queryInterface.addColumn("contact_masters", "storefront_locked_methods", {
    type: Sequelize.TEXT,
    allowNull: true,
  });
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "contact_masters", "storefront_locked_methods")) {
    await queryInterface.removeColumn("contact_masters", "storefront_locked_methods");
  }
};
