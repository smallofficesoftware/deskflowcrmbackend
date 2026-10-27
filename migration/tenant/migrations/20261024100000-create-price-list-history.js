/**
 * Migration Name: create-price-list-history
 * Database Type: TENANT
 * Created: 24/10/2026
 *
 * Keeps the old and new rate / discount / net rate of every price list item, so the Price List
 * Report can show what a product's price was before a change. Filled by database triggers on
 * `price_lists`, so every write path (screen edit, Excel update, category-wise insert, ...) is
 * covered without touching service code. History starts from the day the triggers are created.
 */

const tableExists = async (queryInterface, table) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS c
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table`,
    { replacements: { table } },
  );
  return Number(rows[0]?.c) > 0;
};

export const up = async (queryInterface) => {
  if (!(await tableExists(queryInterface, "price_list_history"))) {
    await queryInterface.sequelize.query(`
      CREATE TABLE \`price_list_history\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`company_masters_id\` INT NULL DEFAULT NULL,
        \`pricelist_masters_id\` INT NULL DEFAULT NULL,
        \`price_list_id\` INT NOT NULL,
        \`product_id\` INT NULL DEFAULT NULL,
        \`change_type\` VARCHAR(10) NOT NULL DEFAULT 'update',
        \`old_rate\` DOUBLE NULL DEFAULT NULL,
        \`new_rate\` DOUBLE NULL DEFAULT NULL,
        \`old_discount\` DOUBLE NULL DEFAULT NULL,
        \`new_discount\` DOUBLE NULL DEFAULT NULL,
        \`old_discount_amount\` DOUBLE NULL DEFAULT NULL,
        \`new_discount_amount\` DOUBLE NULL DEFAULT NULL,
        \`old_net_rate\` DOUBLE NULL DEFAULT NULL,
        \`new_net_rate\` DOUBLE NULL DEFAULT NULL,
        \`changed_by\` INT NULL DEFAULT NULL,
        \`changed_date_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_plh_master_product\` (\`pricelist_masters_id\`, \`product_id\`),
        KEY \`idx_plh_price_list\` (\`price_list_id\`),
        KEY \`idx_plh_changed\` (\`changed_date_time\`)
      )
    `);
  }

  await queryInterface.sequelize.query("DROP TRIGGER IF EXISTS `trg_price_lists_history_insert`");
  await queryInterface.sequelize.query(`
    CREATE TRIGGER \`trg_price_lists_history_insert\` AFTER INSERT ON \`price_lists\`
    FOR EACH ROW
    INSERT INTO \`price_list_history\`
      (\`company_masters_id\`, \`pricelist_masters_id\`, \`price_list_id\`, \`product_id\`, \`change_type\`,
       \`new_rate\`, \`new_discount\`, \`new_discount_amount\`, \`new_net_rate\`, \`changed_by\`, \`changed_date_time\`)
    VALUES
      (NEW.\`company_masters_id\`, NEW.\`pricelist_masters_id\`, NEW.\`id\`, NEW.\`product_id\`, 'insert',
       NEW.\`rate\`, NEW.\`discount\`, NEW.\`discount_amount\`, NEW.\`net_rate\`,
       COALESCE(NULLIF(NEW.\`last_updated_by\`, 0), NEW.\`a_application_login_id\`), NOW())
  `);

  await queryInterface.sequelize.query("DROP TRIGGER IF EXISTS `trg_price_lists_history_update`");
  await queryInterface.sequelize.query(`
    CREATE TRIGGER \`trg_price_lists_history_update\` AFTER UPDATE ON \`price_lists\`
    FOR EACH ROW
    INSERT INTO \`price_list_history\`
      (\`company_masters_id\`, \`pricelist_masters_id\`, \`price_list_id\`, \`product_id\`, \`change_type\`,
       \`old_rate\`, \`new_rate\`, \`old_discount\`, \`new_discount\`, \`old_discount_amount\`, \`new_discount_amount\`,
       \`old_net_rate\`, \`new_net_rate\`, \`changed_by\`, \`changed_date_time\`)
    SELECT
      NEW.\`company_masters_id\`, NEW.\`pricelist_masters_id\`, NEW.\`id\`, NEW.\`product_id\`, 'update',
      OLD.\`rate\`, NEW.\`rate\`, OLD.\`discount\`, NEW.\`discount\`, OLD.\`discount_amount\`, NEW.\`discount_amount\`,
      OLD.\`net_rate\`, NEW.\`net_rate\`, COALESCE(NULLIF(NEW.\`last_updated_by\`, 0), NEW.\`a_application_login_id\`), NOW()
    FROM DUAL
    WHERE NOT (OLD.\`rate\` <=> NEW.\`rate\`)
       OR NOT (OLD.\`discount\` <=> NEW.\`discount\`)
       OR NOT (OLD.\`discount_amount\` <=> NEW.\`discount_amount\`)
       OR NOT (OLD.\`net_rate\` <=> NEW.\`net_rate\`)
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DROP TRIGGER IF EXISTS `trg_price_lists_history_update`");
  await queryInterface.sequelize.query("DROP TRIGGER IF EXISTS `trg_price_lists_history_insert`");
  await queryInterface.dropTable("price_list_history");
};
