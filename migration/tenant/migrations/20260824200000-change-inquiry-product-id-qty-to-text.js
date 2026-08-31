/**
 * Migration Name: change-inquiry-product-id-qty-to-text
 * Database Type: TENANT
 *
 * Inquiry form only supported a single product_id/qty pair (both INT).
 * Widening both to VARCHAR so an inquiry can reference multiple products,
 * each with its own qty, via two comma-separated lists kept positionally
 * paired (product_id="5,12,18", qty="2,1,3" — index N in one lines up
 * with index N in the other). A single product is just "5"/"2" — existing
 * numeric values convert cleanly to their string form, no backfill needed.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.changeColumn("inquiries", "product_id", {
    type: Sequelize.STRING(255),
    allowNull: true,
  });
  await queryInterface.changeColumn("inquiries", "qty", {
    type: Sequelize.STRING(255),
    allowNull: true,
  });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.changeColumn("inquiries", "product_id", {
    type: Sequelize.INTEGER,
    allowNull: true,
  });
  await queryInterface.changeColumn("inquiries", "qty", {
    type: Sequelize.INTEGER,
    allowNull: true,
  });
};
