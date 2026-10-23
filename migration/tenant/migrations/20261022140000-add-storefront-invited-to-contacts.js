/**
 * Migration Name: add-storefront-invited-to-contacts
 * Database Type: TENANT
 * Created: 22/10/2026
 *
 * Invite-only allowlist flag for the ecommerce storefront (plans/2026-10-15-
 * ecommerce-b2b-b2c-plan.txt, P3/Q3) - an admin marks specific existing CRM
 * contacts as allowed to create/use a storefront account. No CRM admin UI
 * toggle for this yet (flagged as a follow-up, not built in this slice) -
 * the column exists so the backend check has something real to read.
 */

const columnExists = async (queryInterface, table, column) => {
  const columns = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(columns, column);
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await columnExists(queryInterface, "contact_masters", "storefront_invited"))) {
    await queryInterface.addColumn("contact_masters", "storefront_invited", {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 0,
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "contact_masters", "storefront_invited")) {
    await queryInterface.removeColumn("contact_masters", "storefront_invited");
  }
};
