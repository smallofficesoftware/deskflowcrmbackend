/**
 * Migration Name: create-product-variant-tables
 * Database Type: TENANT
 * Created: 19/10/2026
 *
 * Multi-variant products (plan plans/2026-10-18-product-variants-and-qty-pricing-plan.txt,
 * section 4.1) - CRM-wide, not ecommerce-specific. These 3 tables define what varies for a
 * parent product (Color, Size, ...), the possible values per attribute, and which value
 * each individual variant (a normal products row, linked via parent_product_id - see
 * 20261018111420-add-variant-columns-to-products.js) carries for each attribute.
 */

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(table);
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await tableExists(queryInterface, "product_variant_attributes"))) {
    await queryInterface.createTable("product_variant_attributes", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
      parent_product_id: { type: Sequelize.INTEGER, allowNull: false },
      attribute_name: { type: Sequelize.STRING(100), allowNull: false },
      display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      modified_date: { type: Sequelize.DATE, allowNull: true },
      isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
      isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
    });
    await queryInterface.addIndex("product_variant_attributes", {
      fields: ["parent_product_id", "isDelete"],
      name: "idx_pva_parent_product",
    });
  }

  if (!(await tableExists(queryInterface, "product_variant_attribute_values"))) {
    await queryInterface.createTable("product_variant_attribute_values", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
      product_variant_attribute_id: { type: Sequelize.INTEGER, allowNull: false },
      value: { type: Sequelize.STRING(100), allowNull: false },
      display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      modified_date: { type: Sequelize.DATE, allowNull: true },
      isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
      isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
    });
    await queryInterface.addIndex("product_variant_attribute_values", {
      fields: ["product_variant_attribute_id", "isDelete"],
      name: "idx_pvav_attribute",
    });
  }

  if (!(await tableExists(queryInterface, "product_variant_option_values"))) {
    await queryInterface.createTable("product_variant_option_values", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
      product_id: { type: Sequelize.INTEGER, allowNull: false, comment: "The VARIANT row itself, not the parent" },
      product_variant_attribute_value_id: { type: Sequelize.INTEGER, allowNull: false },
      created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
      isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
    });
    await queryInterface.addIndex("product_variant_option_values", {
      fields: ["product_id", "isDelete"],
      name: "idx_pvov_product",
    });
    await queryInterface.addIndex("product_variant_option_values", {
      fields: ["product_variant_attribute_value_id"],
      name: "idx_pvov_attribute_value",
    });
  }
};

export const down = async (queryInterface) => {
  for (const table of [
    "product_variant_option_values",
    "product_variant_attribute_values",
    "product_variant_attributes",
  ]) {
    if (await tableExists(queryInterface, table)) {
      await queryInterface.dropTable(table);
    }
  }
};
