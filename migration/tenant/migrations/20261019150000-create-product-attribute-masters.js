/**
 * Migration Name: create-product-attribute-masters
 * Database Type: TENANT
 * Created: 19/10/2026
 *
 * Reusable attribute/value catalog (e.g. "Color" -> Red/Blue/Green) so attributes and
 * their values are defined once per company and picked on any product, instead of being
 * typed fresh for every product (see product_variant_attributes/_values, created in
 * 20261019040055-create-product-variant-tables.js, which still hold the per-product link
 * and now carry a nullable FK back to these masters - 20261019150100).
 */

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(table);
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await tableExists(queryInterface, "product_attribute_masters"))) {
    await queryInterface.createTable("product_attribute_masters", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
      attribute_name: { type: Sequelize.STRING(100), allowNull: false },
      display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      modified_date: { type: Sequelize.DATE, allowNull: true },
      isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
      isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
    });
    await queryInterface.addIndex("product_attribute_masters", {
      fields: ["company_masters_id", "isDelete"],
      name: "idx_pam_company",
    });
  }

  if (!(await tableExists(queryInterface, "product_attribute_value_masters"))) {
    await queryInterface.createTable("product_attribute_value_masters", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
      product_attribute_master_id: { type: Sequelize.INTEGER, allowNull: false },
      value: { type: Sequelize.STRING(100), allowNull: false },
      display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      modified_date: { type: Sequelize.DATE, allowNull: true },
      isActive: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1 },
      isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
    });
    await queryInterface.addIndex("product_attribute_value_masters", {
      fields: ["product_attribute_master_id", "isDelete"],
      name: "idx_pavm_attribute_master",
    });
  }
};

export const down = async (queryInterface) => {
  for (const table of ["product_attribute_value_masters", "product_attribute_masters"]) {
    if (await tableExists(queryInterface, table)) {
      await queryInterface.dropTable(table);
    }
  }
};
