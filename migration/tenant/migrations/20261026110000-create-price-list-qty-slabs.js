/**
 * Migration Name: create-price-list-qty-slabs
 * Database Type: TENANT
 * Created: 26/10/2026
 *
 * Quantity-based pricing for the ecommerce storefront. One row = "from
 * min_qty units, the unit rate is rate / net_rate". pricelist_masters_id 0 =
 * the product's own base slabs (applies when no price list has slabs for it).
 */

export const up = async (queryInterface, Sequelize) => {
  const tables = await queryInterface.showAllTables();
  if (tables.includes("price_list_qty_slabs")) return;
  await queryInterface.createTable("price_list_qty_slabs", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    a_application_login_id: { type: Sequelize.INTEGER, allowNull: false },
    pricelist_masters_id: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    product_id: { type: Sequelize.INTEGER, allowNull: false },
    min_qty: { type: Sequelize.INTEGER, allowNull: false },
    rate: { type: Sequelize.DOUBLE, allowNull: false },
    net_rate: { type: Sequelize.DOUBLE, allowNull: false },
    isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
  });
  await queryInterface.addIndex("price_list_qty_slabs", ["product_id", "pricelist_masters_id"], {
    name: "idx_qty_slabs_product_list",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("price_list_qty_slabs");
};
