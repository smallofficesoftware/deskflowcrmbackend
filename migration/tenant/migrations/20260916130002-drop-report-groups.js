/**
 * Migration Name: drop-report-groups
 * Database Type: TENANT
 *
 * Removes the tenant-defined custom-groups feature (report_groups table,
 * report_definitions.report_group_id) now that every report has a
 * category instead (previous two migrations). down() restores the empty
 * table/column shape only — the group_name/report_group_id data itself
 * isn't recoverable once dropped.
 */

export const up = async (queryInterface) => {
  const table = await queryInterface.describeTable("report_definitions");
  if (table.report_group_id) {
    await queryInterface.removeColumn("report_definitions", "report_group_id");
  }

  const tables = await queryInterface.sequelize.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = 'report_groups' AND TABLE_SCHEMA = DATABASE()",
  );
  if (tables[0].length > 0) {
    await queryInterface.dropTable("report_groups");
  }
};

export const down = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("report_definitions");
  if (!table.report_group_id) {
    await queryInterface.addColumn("report_definitions", "report_group_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
  }

  await queryInterface.createTable("report_groups", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    group_name: { type: Sequelize.STRING, allowNull: false },
    display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    created_date_time: { type: Sequelize.DATE, allowNull: false },
    isDelete: { type: Sequelize.TINYINT, defaultValue: 0 },
    isActive: { type: Sequelize.TINYINT, defaultValue: 1 },
  });
};
