/**
 * Migration Name: create-storefront-themes
 * Database Type: MASTER
 *
 * Theme catalog for the B2B/B2C ecommerce storefront addon (plans/2026-10-15-
 * ecommerce-b2b-b2c-plan.txt, 4.6). Pharmacy is the only theme today, shipped
 * as 'basic' so every company on the addon can use it from day one -
 * required_tier gates future themes to a higher Customer Panel tier (not
 * built by this migration - that lookup lands later per 4.6/Q1). Kept as its
 * own dedicated table, separate from marketplace_addon_settings, because a
 * theme pick has its own lifecycle (activated_date, per company, see the
 * paired company_storefront_theme tenant migration) rather than being a
 * permission/limit value.
 */

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(table);
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await tableExists(queryInterface, "storefront_themes"))) {
    await queryInterface.createTable("storefront_themes", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      code: { type: Sequelize.STRING(50), allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.STRING(255), allowNull: true },
      preview_image: { type: Sequelize.STRING(255), allowNull: true },
      required_tier: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "basic", comment: "basic|advanced - Customer Panel tier that unlocks this theme" },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
      isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
    });

    await queryInterface.addIndex("storefront_themes", {
      fields: ["code"],
      unique: true,
      name: "uq_storefront_themes_code",
    });
  }

  const [existingPharmacy] = await queryInterface.sequelize.query(
    "SELECT id FROM `storefront_themes` WHERE `code` = 'pharmacy' LIMIT 1"
  );
  if (existingPharmacy.length === 0) {
    await queryInterface.sequelize.query(
      "INSERT INTO `storefront_themes` (`code`, `name`, `description`, `required_tier`, `sort_order`, `isActive`, `isDelete`) VALUES ('pharmacy', 'Pharmacy', 'Pharmacy storefront theme, ported from a purchased ThemeForest template (customerdata/pharmacy-template-extract/).', 'basic', 0, 1, 0)"
    );
  }
};

export const down = async (queryInterface) => {
  if (await tableExists(queryInterface, "storefront_themes")) {
    await queryInterface.dropTable("storefront_themes");
  }
};
