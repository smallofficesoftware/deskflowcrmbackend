/**
 * Migration Name: add-parent-category-id-to-categories
 * Database Type: TENANT
 * Created: 22/10/2026
 *
 * Subcategory support for the ecommerce storefront's category browse pages
 * (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P2/4.7 - "like shopify" URL
 * decision, 21-10-2026). categories.group_id is a DIFFERENT, unrelated
 * concept (links to product_groups) - this is a genuinely new self-
 * referencing parent/child relationship, one level deep for phase 1 (a
 * subcategory's own parent_category_id is always a top-level category, not
 * itself a subcategory - not enforced at the DB level, just the UI/API
 * convention this phase builds against).
 */

const columnExists = async (queryInterface, table, column) => {
  const columns = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(columns, column);
};

export const up = async (queryInterface, Sequelize) => {
  if (!(await columnExists(queryInterface, "categories", "parent_category_id"))) {
    await queryInterface.addColumn("categories", "parent_category_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "categories", "parent_category_id")) {
    await queryInterface.removeColumn("categories", "parent_category_id");
  }
};
