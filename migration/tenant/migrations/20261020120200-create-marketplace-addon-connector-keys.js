/**
 * Migration Name: create-marketplace-addon-connector-keys
 * Database Type: TENANT
 * Created: 20/10/2026
 *
 * Generic connector-key issuance/revocation history, shared across marketplace
 * addons (addon_code-discriminated, first user: Tally). Split out from
 * marketplace_addon_settings because key issuance/revocation has its own
 * lifecycle (superadmin-issued, revocable - plans/2026-10-08-marketplace-tally-
 * plan.txt Q5) - no existing table in this codebase tracks issued/revoked/
 * last-used history for an integration credential (every prior integration just
 * overwrites a column in place, see miracleTokenManager.js), this is the first.
 */

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(table);
};

export const up = async (queryInterface, Sequelize) => {
  if (await tableExists(queryInterface, "marketplace_addon_connector_keys")) return;

  await queryInterface.createTable("marketplace_addon_connector_keys", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    addon_code: { type: Sequelize.STRING(50), allowNull: false },
    connector_key: { type: Sequelize.STRING(255), allowNull: false },
    issued_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    revoked_date_time: { type: Sequelize.DATE, allowNull: true },
    last_used_at: { type: Sequelize.DATE, allowNull: true },
    created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
    isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
  });

  await queryInterface.addIndex("marketplace_addon_connector_keys", {
    fields: ["company_masters_id", "addon_code"],
    name: "idx_mack_company_addon",
  });
};

export const down = async (queryInterface) => {
  if (await tableExists(queryInterface, "marketplace_addon_connector_keys")) {
    await queryInterface.dropTable("marketplace_addon_connector_keys");
  }
};
