/**
 * Migration Name: add-requires-sub-job-card-to-bom-process-vs-cons-rejcts
 * Database Type: TENANT
 *
 * Per-BOM-material-row checkbox (BOM Master, consumption items): whether
 * this material needs its own sub jobwork. Gates whether "Generate Sub Job
 * Card" is offered for that row on the parent job card - having a BOM of
 * its own is necessary but not sufficient, this flag is what the shop
 * actually decides. Defaults to 0 (unchecked) for all existing rows.
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
  if (!(await columnExists(queryInterface, "bom_process_vs_cons_rejcts", "requires_sub_job_card"))) {
    await queryInterface.addColumn("bom_process_vs_cons_rejcts", "requires_sub_job_card", {
      type: Sequelize.TINYINT,
      allowNull: true,
      defaultValue: 0,
    });
  }
};

export const down = async (queryInterface) => {
  if (await columnExists(queryInterface, "bom_process_vs_cons_rejcts", "requires_sub_job_card")) {
    await queryInterface.removeColumn("bom_process_vs_cons_rejcts", "requires_sub_job_card");
  }
};
