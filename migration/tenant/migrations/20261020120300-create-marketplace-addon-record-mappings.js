/**
 * Migration Name: create-marketplace-addon-record-mappings
 * Database Type: TENANT
 * Created: 20/10/2026
 *
 * Generic record-level mapping (CRM record <-> external record, e.g. contact <->
 * Tally ledger, product <-> stock item, GST ledgers, voucher types), shared
 * across marketplace addons via addon_code - plans/2026-10-08-marketplace-tally-
 * plan.txt Q6/4.1. Replaces that plan's earlier, never-schema'd tally_mappings.
 */

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(table);
};

export const up = async (queryInterface, Sequelize) => {
  if (await tableExists(queryInterface, "marketplace_addon_record_mappings")) return;

  await queryInterface.createTable("marketplace_addon_record_mappings", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    addon_code: { type: Sequelize.STRING(50), allowNull: false },
    entity_type: { type: Sequelize.STRING(50), allowNull: false },
    crm_id: { type: Sequelize.INTEGER, allowNull: true },
    crm_ref: { type: Sequelize.STRING(150), allowNull: true },
    external_id: { type: Sequelize.STRING(150), allowNull: true },
    external_ref: { type: Sequelize.STRING(150), allowNull: true },
    external_alter_id: { type: Sequelize.STRING(50), allowNull: true },
    match_confidence: { type: Sequelize.STRING(20), allowNull: true },
    is_confirmed: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
    direction: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "both" },
    config_json: { type: Sequelize.JSON, allowNull: true },
    created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    modified_date: { type: Sequelize.DATE, allowNull: true },
    isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
    isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
  });

  await queryInterface.addIndex("marketplace_addon_record_mappings", {
    fields: ["company_masters_id", "addon_code", "entity_type", "crm_id"],
    name: "idx_marm_company_addon_entity_crm",
  });
};

export const down = async (queryInterface) => {
  if (await tableExists(queryInterface, "marketplace_addon_record_mappings")) {
    await queryInterface.dropTable("marketplace_addon_record_mappings");
  }
};
