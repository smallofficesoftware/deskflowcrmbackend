/**
 * Migration Name: add-show-in-ecommerce-to-products
 * Database Type: TENANT
 * Created: 22/10/2026
 *
 * Per-product visibility toggle for the ecommerce storefront's public catalog
 * (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P2). Variant-specific (like
 * rate/is_serial_number), not shared - a Parent ("Has Variants" template)
 * never has this field, each Variant/Simple product controls its own
 * storefront visibility independently. Defaults to 1 (shown) so enabling the
 * addon doesn't require touching every existing product first - an
 * opt-out model, matching how most ecommerce platforms default a new/
 * existing product to visible unless explicitly hidden.
 */

const columnExists = async (queryInterface, table, column) => {
  const columns = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(columns, column);
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await columnExists(queryInterface, "products", "show_in_ecommerce"))) {
    await queryInterface.addColumn("products", "show_in_ecommerce", {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 1,
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "products", "show_in_ecommerce")) {
    await queryInterface.removeColumn("products", "show_in_ecommerce");
  }
};
