/**
 * Migration Name: drop-report-runs
 * Database Type: TENANT
 *
 * report_runs was write-only — every report run/schedule dispatch logged
 * a row here, but nothing ever read it back (no Run History screen/
 * endpoint was ever built on top of it). Dropped as dead weight.
 */

export const up = async (queryInterface) => {
  const tables = await queryInterface.sequelize.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = 'report_runs' AND TABLE_SCHEMA = DATABASE()",
  );
  if (tables[0].length > 0) {
    await queryInterface.dropTable("report_runs");
  }
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("report_runs", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER },
    report_definition_id: { type: Sequelize.INTEGER },
    executed_by: { type: Sequelize.INTEGER },
    executed_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    filters_snapshot_json: { type: Sequelize.TEXT },
    row_count: { type: Sequelize.INTEGER },
    duration_ms: { type: Sequelize.INTEGER },
    success: { type: Sequelize.TINYINT, defaultValue: 1 },
    error_message: { type: Sequelize.STRING(500) },
    trigger_type: { type: Sequelize.ENUM("manual", "scheduled"), allowNull: false, defaultValue: "manual" },
  });
  await queryInterface.addIndex("report_runs", {
    fields: ["company_masters_id", "report_definition_id"],
    name: "idx_report_runs_definition",
  });
};
