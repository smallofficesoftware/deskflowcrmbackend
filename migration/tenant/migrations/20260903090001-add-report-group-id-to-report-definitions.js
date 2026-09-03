/**
 * Migration Name: add-report-group-id-to-report-definitions
 * Database Type: TENANT
 *
 * Nullable FK-by-convention (no formal foreign key, same convention every
 * other *_id column in this table already follows) into report_groups —
 * NULL means ungrouped, not an error.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("report_definitions");
  if (!table.report_group_id) {
    await queryInterface.addColumn("report_definitions", "report_group_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("report_definitions", "report_group_id");
};
