/**
 * Migration Name: add-parent-job-card-to-job-cards
 * Database Type: TENANT
 *
 * Adds an explicit link from a "sub jobwork" job card back to the parent
 * job card whose BOM material row it was auto-created to fulfil:
 *   parent_job_card_id -> job_cards.id of the parent (NULL for ordinary cards)
 *   parent_material_id -> products.id of the material in the parent's BOM
 *                          this sub job card produces
 * No FK constraint (this schema does not use FK constraints elsewhere - see
 * job_cards.contact_id/order_id/item_id, none of which are FKs either).
 * Written idempotently - MySQL auto-commits each DDL statement, so a partial
 * re-run must not fail on already-applied steps.
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
  if (!(await columnExists(queryInterface, "job_cards", "parent_job_card_id"))) {
    await queryInterface.addColumn("job_cards", "parent_job_card_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
  }
  if (!(await columnExists(queryInterface, "job_cards", "parent_material_id"))) {
    await queryInterface.addColumn("job_cards", "parent_material_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "job_cards", "parent_material_id")) {
    await queryInterface.removeColumn("job_cards", "parent_material_id");
  }
  if (await columnExists(queryInterface, "job_cards", "parent_job_card_id")) {
    await queryInterface.removeColumn("job_cards", "parent_job_card_id");
  }
};
