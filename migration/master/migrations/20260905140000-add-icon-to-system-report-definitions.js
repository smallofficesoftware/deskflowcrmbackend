/**
 * Migration Name: add-icon-to-system-report-definitions
 * Database Type: MASTER
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("system_report_definitions", "icon", {
    type: Sequelize.STRING,
    allowNull: true,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("system_report_definitions", "icon");
};
