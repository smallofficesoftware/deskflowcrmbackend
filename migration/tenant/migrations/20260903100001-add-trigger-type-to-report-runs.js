/**
 * Migration Name: add-trigger-type-to-report-runs
 * Database Type: TENANT
 *
 * Distinguishes a scheduled dispatch (Step 8a) from someone clicking Run —
 * feeds Run History and will feed a future Schedule History view.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("report_runs");
  if (!table.trigger_type) {
    await queryInterface.addColumn("report_runs", "trigger_type", {
      type: Sequelize.ENUM("manual", "scheduled"),
      allowNull: false,
      defaultValue: "manual",
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("report_runs", "trigger_type");
};
