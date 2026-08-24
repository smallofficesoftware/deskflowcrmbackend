/**
 * Migration Name: add-item-discount-type
 * Database Type: TENANT
 *
 * The item-level "Dis/Qty" %/₹ toggle (OrderCreateModal.tsx's discountType
 * state) was never persisted — both item_discount_pct and item_discount_pr
 * are always saved together, but nothing recorded which one the user
 * actually meant, so print always showed item_discount_pct regardless.
 * Same convention as carts.cash_discount_type: 1 = percentage, 2 = flat
 * amount. One value per cart (the toggle applies to the whole item table,
 * not per row).
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("carts", "item_discount_type", {
    type: Sequelize.TINYINT,
    allowNull: true,
    defaultValue: null,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("carts", "item_discount_type");
};
