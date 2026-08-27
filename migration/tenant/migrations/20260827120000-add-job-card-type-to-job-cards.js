/**
 * Migration Name: add-job-card-type-to-job-cards
 * Database Type: TENANT
 *
 * Adds a discriminator column so a job card can be raised without a sales
 * order behind it:
 *   1 = from order   -> job_cards.item_id is a cart_items.id (existing behaviour)
 *   2 = direct product -> job_cards.item_id is a products.id, no customer/order
 *   3 = for customer   -> job_cards.item_id is a products.id, customer linked, no order
 *
 * Existing rows default to 1. contact_id / order_id are relaxed to NULL so
 * types 2 and 3 can omit them. Written idempotently — MySQL auto-commits each
 * DDL statement, so a partial re-run must not fail on already-applied steps.
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
  if (!(await columnExists(queryInterface, "job_cards", "job_card_type"))) {
    await queryInterface.addColumn("job_cards", "job_card_type", {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 1,
    });
  }

  await queryInterface.sequelize.query(
    "ALTER TABLE `job_cards` MODIFY `contact_id` INT NULL",
  );
  await queryInterface.sequelize.query(
    "ALTER TABLE `job_cards` MODIFY `order_id` INT NULL",
  );
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "job_cards", "job_card_type")) {
    await queryInterface.removeColumn("job_cards", "job_card_type");
  }
};
