/**
 * Migration Name: add-production-process-actual-time
 * Database Type: TENANT
 *
 * Adds actual-time tracking to Production Entry, per-process (matching BOM's
 * per-process `bom_vs_process_lists.required_time`, also now seconds).
 *
 * production_transaction_items is one row per (process, material) pair - a
 * process with several consumption/rejection materials has several rows, and
 * a process with none has zero rows. Neither shape can safely hold a single
 * per-process time value (duplicate-on-every-row or pick-one-arbitrary-row,
 * plus no row at all for a material-less process). New table instead: one
 * row per (production entry, process).
 *
 * Also adds `total_actual_time` (seconds) to `production_transactions` -
 * the summed total across that entry's processes, for quick header display
 * without joining the new table.
 */

export const up = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  const names = tables.map((t) => (typeof t === "string" ? t : t.tableName));

  if (!names.includes("production_transaction_process_times")) {
    await queryInterface.sequelize.query(`
      CREATE TABLE \`production_transaction_process_times\` (
        \`id\` INT(11) NOT NULL AUTO_INCREMENT,
        \`job_id\` INT(11) NULL DEFAULT NULL,
        \`production_id\` INT(11) NULL DEFAULT NULL,
        \`bom_id\` INT(11) NULL DEFAULT NULL,
        \`process_id\` INT(11) NULL DEFAULT NULL,
        \`actual_time\` INT(11) NULL DEFAULT NULL COMMENT 'seconds',
        \`company_masters_id\` INT(11) NULL DEFAULT NULL,
        \`a_application_login_id\` INT(11) NULL DEFAULT NULL,
        \`created_date_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`s_timestemp\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`isDelete\` TINYINT(4) NOT NULL DEFAULT 0,
        \`isActive\` TINYINT(4) NOT NULL DEFAULT 1,
        \`modified_date\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_production_id\` (\`production_id\`),
        INDEX \`idx_process_id\` (\`process_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);
  }

  const productionTransactionsColumns = await queryInterface.describeTable("production_transactions");
  if (!productionTransactionsColumns.total_actual_time) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`production_transactions\` ADD COLUMN \`total_actual_time\` INT(11) NULL DEFAULT NULL COMMENT 'seconds, summed from production_transaction_process_times' AFTER \`rejection_qty\`;
    `);
  }
};

export const down = async (queryInterface) => {
  const productionTransactionsColumns = await queryInterface.describeTable("production_transactions");
  if (productionTransactionsColumns.total_actual_time) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`production_transactions\` DROP COLUMN \`total_actual_time\`;
    `);
  }
  await queryInterface.dropTable("production_transaction_process_times");
};
