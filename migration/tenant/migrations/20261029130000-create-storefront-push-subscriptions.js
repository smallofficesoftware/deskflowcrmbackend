/**
 * Migration Name: create-storefront-push-subscriptions
 * Database Type: TENANT
 * Created: 29/10/2026
 *
 * Web-push subscriptions of storefront customers (one row per browser/device). Used to push order
 * status updates and chat replies to the customer's installed storefront app.
 */

export const up = async (queryInterface, Sequelize) => {
  const tables = await queryInterface.showAllTables();
  if (tables.includes("storefront_push_subscriptions")) return;
  await queryInterface.createTable("storefront_push_subscriptions", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    contact_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    endpoint: { type: Sequelize.STRING(500), allowNull: false },
    p256dh: { type: Sequelize.STRING(255), allowNull: false },
    auth: { type: Sequelize.STRING(255), allowNull: false },
    user_agent: { type: Sequelize.STRING(255), allowNull: true },
    created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
  });
  await queryInterface.addIndex("storefront_push_subscriptions", ["contact_masters_id"], { name: "idx_sf_push_contact" });
  await queryInterface.addIndex("storefront_push_subscriptions", ["endpoint"], { name: "idx_sf_push_endpoint", unique: true });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("storefront_push_subscriptions");
};
