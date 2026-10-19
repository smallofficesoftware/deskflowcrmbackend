/**
 * Migration Name: add-master-link-to-product-variant-attributes
 * Database Type: TENANT
 * Created: 19/10/2026
 *
 * Links each per-product variant attribute/value (product_variant_attributes/_values)
 * back to the reusable catalog row it was picked from (product_attribute_masters/
 * _value_masters, created in 20261019150000). Nullable: existing per-product rows
 * created before this catalog existed keep working with no master link.
 */

const columnExists = async (queryInterface, table, column) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
        AND COLUMN_NAME = :column`,
    { replacements: { table, column } },
  );
  return Number(rows[0]?.c) > 0;
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await columnExists(queryInterface, "product_variant_attributes", "product_attribute_master_id"))) {
    await queryInterface.addColumn("product_variant_attributes", "product_attribute_master_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: "FK to product_attribute_masters.id - which catalog attribute this was picked from",
    });
    await queryInterface.addIndex("product_variant_attributes", {
      fields: ["product_attribute_master_id"],
      name: "idx_pva_attribute_master",
    });
  }

  if (!(await columnExists(queryInterface, "product_variant_attribute_values", "product_attribute_value_master_id"))) {
    await queryInterface.addColumn("product_variant_attribute_values", "product_attribute_value_master_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: "FK to product_attribute_value_masters.id - which catalog value this was picked from",
    });
    await queryInterface.addIndex("product_variant_attribute_values", {
      fields: ["product_attribute_value_master_id"],
      name: "idx_pvav_value_master",
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "product_variant_attribute_values", "product_attribute_value_master_id")) {
    await queryInterface.removeIndex("product_variant_attribute_values", "idx_pvav_value_master");
    await queryInterface.removeColumn("product_variant_attribute_values", "product_attribute_value_master_id");
  }
  if (await columnExists(queryInterface, "product_variant_attributes", "product_attribute_master_id")) {
    await queryInterface.removeIndex("product_variant_attributes", "idx_pva_attribute_master");
    await queryInterface.removeColumn("product_variant_attributes", "product_attribute_master_id");
  }
};
