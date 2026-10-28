/**
 * Migration Name: create-storefront-domains
 * Database Type: MASTER
 *
 * Custom-domain -> company lookup for the ecommerce storefront
 * (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, Q8/4.3a). A storefront request
 * arrives with only a hostname, and tenant data lives in per-company databases,
 * so the hostname -> company mapping has to live in the shared master DB.
 * One domain per company in this first slice (unique on company_masters_id too).
 */

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(table);
};

export const up = async (queryInterface, Sequelize) => {
  if (await tableExists(queryInterface, "storefront_domains")) return;

  await queryInterface.createTable("storefront_domains", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    a_application_login_id: { type: Sequelize.INTEGER, allowNull: false },
    domain: { type: Sequelize.STRING(255), allowNull: false },
    verification_token: { type: Sequelize.STRING(64), allowNull: false },
    verified_at: { type: Sequelize.DATE, allowNull: true },
    isDelete: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
  });

  await queryInterface.addIndex("storefront_domains", { fields: ["domain"], unique: true, name: "uq_storefront_domains_domain" });
  await queryInterface.addIndex("storefront_domains", { fields: ["company_masters_id"], unique: true, name: "uq_storefront_domains_company" });
};

export const down = async (queryInterface) => {
  if (await tableExists(queryInterface, "storefront_domains")) {
    await queryInterface.dropTable("storefront_domains");
  }
};
