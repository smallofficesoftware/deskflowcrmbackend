/**
 * Migration Name: create-report-runs
 * Database Type: TENANT
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("report_runs", {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: Sequelize.INTEGER,
    },
    report_definition_id: {
      type: Sequelize.INTEGER,
    },
    executed_by: {
      type: Sequelize.INTEGER,
    },
    executed_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    filters_snapshot_json: {
      type: Sequelize.TEXT,
    },
    row_count: {
      type: Sequelize.INTEGER,
    },
    duration_ms: {
      type: Sequelize.INTEGER,
    },
    success: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
    },
    error_message: {
      type: Sequelize.STRING(500),
    },
  });

  await queryInterface.addIndex("report_runs", {
    fields: ["company_masters_id", "report_definition_id"],
    name: "idx_report_runs_definition",
  });
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("report_runs");
};
