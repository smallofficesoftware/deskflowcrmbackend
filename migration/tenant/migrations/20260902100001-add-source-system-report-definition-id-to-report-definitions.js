/**
 * Migration Name: add-source-system-report-definition-id-to-report-definitions
 * Database Type: TENANT
 *
 * Tracks which system_report_definitions (master DB) gallery row a copied
 * report_definitions row came from, if any — NULL for a report the tenant
 * built from scratch. Set by copyFromSystemReportDefinition() at copy time,
 * never by the regular create/update path. Enables a later "already added" /
 * "update available" gallery indicator without a second migration.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("report_definitions");
  if (!table.source_system_report_definition_id) {
    await queryInterface.addColumn("report_definitions", "source_system_report_definition_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("report_definitions", "source_system_report_definition_id");
};
