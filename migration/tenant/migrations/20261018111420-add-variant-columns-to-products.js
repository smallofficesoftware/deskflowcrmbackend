/**
 * Migration Name: add-variant-columns-to-products
 * Database Type: TENANT
 * Created: 18/10/2026 04:44:20 PM
 *
 * Multi-variant products (plan plans/2026-10-18-product-variants-and-qty-pricing-plan.txt,
 * section 4.1) - CRM-wide, not ecommerce-specific. A variant stays a full `products` row
 * (so cart_items/stock/price_lists/reports need no changes at all) and is linked to its
 * parent via parent_product_id. is_variant_parent marks the non-sellable "template" row
 * (e.g. "T-Shirt" itself) so the internal product picker can exclude it (see the plan's
 * Q3 - a backend query change, not touched by this migration).
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
  if (!(await columnExists(queryInterface, "products", "parent_product_id"))) {
    await queryInterface.addColumn("products", "parent_product_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: "Self-FK to products.id - set on a variant row, pointing at its parent",
    });
    await queryInterface.addIndex("products", {
      fields: ["parent_product_id"],
      name: "idx_products_parent_product_id",
    });
  }

  if (!(await columnExists(queryInterface, "products", "is_variant_parent"))) {
    await queryInterface.addColumn("products", "is_variant_parent", {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 0,
      comment: "1 = non-sellable template row (e.g. 'T-Shirt' itself); exclude from direct sale",
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "products", "is_variant_parent")) {
    await queryInterface.removeColumn("products", "is_variant_parent");
  }
  if (await columnExists(queryInterface, "products", "parent_product_id")) {
    await queryInterface.removeIndex("products", "idx_products_parent_product_id");
    await queryInterface.removeColumn("products", "parent_product_id");
  }
};
