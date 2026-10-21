/**
 * Migration Name: create-marketplace-addon-settings
 * Database Type: TENANT
 * Created: 20/10/2026
 *
 * Generic, addon_code-discriminated settings table shared by every connector-based
 * marketplace addon (first user: Tally, plans/2026-10-08-marketplace-tally-plan.txt
 * section 4.1) - NOT a Tally-specific table, per this plan's MASTER RULES. Carries
 * company_masters_id even though the tenant DB is already one-company-scoped, to
 * match the live convention (see product_attribute_masters, report_schedules,
 * a_application_login_type_rights).
 */

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(table);
};

export const up = async (queryInterface, Sequelize) => {
  if (await tableExists(queryInterface, "marketplace_addon_settings")) return;

  await queryInterface.createTable("marketplace_addon_settings", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    addon_code: { type: Sequelize.STRING(50), allowNull: false },
    connection_mode: { type: Sequelize.STRING(20), allowNull: true },
    direct_url_host: { type: Sequelize.STRING(255), allowNull: true },
    direct_url_port: { type: Sequelize.INTEGER, allowNull: true },
    config_json: { type: Sequelize.JSON, allowNull: true },
    last_sync_at: { type: Sequelize.DATE, allowNull: true },
    created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    modified_date: { type: Sequelize.DATE, allowNull: true },
    isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
    isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
  });

  await queryInterface.addIndex("marketplace_addon_settings", {
    fields: ["company_masters_id", "addon_code"],
    unique: true,
    name: "uq_mas_company_addon",
  });
};

export const down = async (queryInterface) => {
  if (await tableExists(queryInterface, "marketplace_addon_settings")) {
    await queryInterface.dropTable("marketplace_addon_settings");
  }
};
