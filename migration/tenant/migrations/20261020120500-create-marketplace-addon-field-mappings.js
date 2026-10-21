/**
 * Migration Name: create-marketplace-addon-field-mappings
 * Database Type: TENANT
 * Created: 20/10/2026
 *
 * Generic field-level mapping (which CRM column/custom-field feeds which addon
 * field, e.g. UDF), shared across marketplace addons via addon_code - plans/
 * 2026-10-08-marketplace-tally-plan.txt section 4.6. Covers standard columns
 * and custom fields alike via source_type/source_ref, same shape Miracle's
 * third_party_field_name covers for one addon only (getMiracleUfdDet /
 * extractMiracleCustomFields) - this table generalizes that to addon_code.
 */

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(table);
};

export const up = async (queryInterface, Sequelize) => {
  if (await tableExists(queryInterface, "marketplace_addon_field_mappings")) return;

  await queryInterface.createTable("marketplace_addon_field_mappings", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    addon_code: { type: Sequelize.STRING(50), allowNull: false },
    form_type: { type: Sequelize.INTEGER, allowNull: false },
    source_type: { type: Sequelize.STRING(20), allowNull: false },
    source_ref: { type: Sequelize.STRING(100), allowNull: false },
    external_field_name: { type: Sequelize.STRING(150), allowNull: false },
    direction: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "both" },
    transform: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "none" },
    config_json: { type: Sequelize.JSON, allowNull: true },
    created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    modified_date: { type: Sequelize.DATE, allowNull: true },
    isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
    isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
  });

  await queryInterface.addIndex("marketplace_addon_field_mappings", {
    fields: ["company_masters_id", "addon_code", "form_type"],
    name: "idx_mafm_company_addon_form",
  });
};

export const down = async (queryInterface) => {
  if (await tableExists(queryInterface, "marketplace_addon_field_mappings")) {
    await queryInterface.dropTable("marketplace_addon_field_mappings");
  }
};
