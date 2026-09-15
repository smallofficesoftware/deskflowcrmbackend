/**
 * Migration Name: add-is-dashboard-only-to-report-definitions
 * Database Type: TENANT
 *
 * Dashboard feature, Phase 3 — the Add-Widget modal's "quick counter"
 * shortcut auto-creates a minimal report_definitions row (single aggregate
 * column) behind the scenes instead of forcing the user through the full
 * Report Builder wizard. Those auto-created rows are marked
 * is_dashboard_only=1 so listReportDefinitions/listRunnableReportDefinitions
 * can filter them out of the main Report Builder list — they're not meant
 * to be browsed/run standalone, only via their dashboard widget.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn("report_definitions", "is_dashboard_only", {
    type: Sequelize.TINYINT,
    defaultValue: 0,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("report_definitions", "is_dashboard_only");
};
