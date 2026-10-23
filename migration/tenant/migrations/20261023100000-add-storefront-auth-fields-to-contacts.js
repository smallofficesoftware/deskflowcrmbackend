/**
 * Migration Name: add-storefront-auth-fields-to-contacts
 * Database Type: TENANT
 * Created: 23/10/2026
 *
 * REVISED 23-10-2026, per the user: a storefront customer IS a contact, not a
 * separate identity - the old online-store module's own precedent
 * (onlineStoreService.js) already finds-or-creates a contact_masters row by
 * mobile number for exactly this purpose, and contact_masters already has
 * address/city/state/pincode/area fields, so a separate storefront_customers/
 * storefront_addresses pair (built, tested, then dropped this same day - see
 * alter.txt history) was the wrong shape. These five columns are the only
 * things contact_masters genuinely lacks: an auth secret and verification/
 * signup state. All prefixed `storefront_` (matching storefront_invited,
 * 20261022140000) so they stay clearly scoped within a table every CRM
 * screen/report/export also reads.
 *
 * storefront_signup_method is the signal for "this contact has a storefront
 * account" (non-null) vs. "this is just a CRM contact/lead who's never used
 * the storefront" (null) - canSignUp()'s invite-only gate in
 * storefrontAuthService.js checks this, not whether the contact_masters row
 * itself pre-existed.
 */

const columnExists = async (queryInterface, table, column) => {
  const columns = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(columns, column);
};

const COLUMNS = {
  storefront_pin_hash: { type: "STRING", length: 255, allowNull: true },
  storefront_is_verified_mobile: { type: "TINYINT", allowNull: false, defaultValue: 0 },
  storefront_is_verified_email: { type: "TINYINT", allowNull: false, defaultValue: 0 },
  storefront_signup_method: { type: "STRING", length: 30, allowNull: true },
  storefront_last_login_date: { type: "DATE", allowNull: true },
};

export const up = async (queryInterface, Sequelize) => {
  for (const [name, def] of Object.entries(COLUMNS)) {
    if (await columnExists(queryInterface, "contact_masters", name)) continue;
    await queryInterface.addColumn("contact_masters", name, {
      type: def.length ? Sequelize[def.type](def.length) : Sequelize[def.type],
      allowNull: def.allowNull,
      defaultValue: def.defaultValue,
    });
  }
};

export const down = async (queryInterface) => {
  for (const name of Object.keys(COLUMNS)) {
    if (await columnExists(queryInterface, "contact_masters", name)) {
      await queryInterface.removeColumn("contact_masters", name);
    }
  }
};
