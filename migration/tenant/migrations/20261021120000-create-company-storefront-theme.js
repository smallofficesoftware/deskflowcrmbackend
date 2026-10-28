/**
 * Migration Name: create-company-storefront-theme
 * Database Type: TENANT
 * Created: 21/10/2026
 *
 * A company's active storefront theme pick (plans/2026-10-15-ecommerce-b2b-
 * b2c-plan.txt, 4.6) - kept separate from the master-DB storefront_themes
 * catalog and from the tenant's own marketplace_addon_settings (addon on/off
 * + general config), because a theme switch has its own lifecycle
 * (activated_date) distinct from either the catalog or a company's general
 * addon settings. One row per company - a new pick replaces the prior row's
 * isActive state rather than always inserting (see the matching service
 * logic once the theme-picker admin UI lands).
 */

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(table);
};

export const up = async (queryInterface, Sequelize) => {
  if (await tableExists(queryInterface, "company_storefront_theme")) return;

  await queryInterface.createTable("company_storefront_theme", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    storefront_theme_id: { type: Sequelize.INTEGER, allowNull: false, comment: "FK to master DB storefront_themes.id - no cross-DB FK constraint, resolved in application code" },
    activated_date: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    modified_date: { type: Sequelize.DATE, allowNull: true },
    isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
    isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
  });

  await queryInterface.addIndex("company_storefront_theme", {
    fields: ["company_masters_id"],
    unique: true,
    name: "uq_cst_company",
  });
};

export const down = async (queryInterface) => {
  if (await tableExists(queryInterface, "company_storefront_theme")) {
    await queryInterface.dropTable("company_storefront_theme");
  }
};
