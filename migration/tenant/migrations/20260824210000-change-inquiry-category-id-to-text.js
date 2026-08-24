/**
 * Migration Name: change-inquiry-category-id-to-text
 * Database Type: TENANT
 *
 * Companion to change-inquiry-product-id-qty-to-text — category_id widened
 * to VARCHAR the same way, positionally paired with product_id/qty (index N
 * across all three lines up), since each added product row is picked under
 * its own category filter. A single category is just "3" — existing numeric
 * values convert cleanly to their string form, no backfill needed.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.changeColumn("inquiries", "category_id", {
    type: Sequelize.STRING(255),
    allowNull: true,
  });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.changeColumn("inquiries", "category_id", {
    type: Sequelize.INTEGER,
    allowNull: true,
  });
};
