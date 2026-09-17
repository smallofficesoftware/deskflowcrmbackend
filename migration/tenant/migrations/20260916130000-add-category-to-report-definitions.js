/**
 * Migration Name: add-category-to-report-definitions
 * Database Type: TENANT
 *
 * Replaces the tenant-defined report_groups (custom, user-created) with
 * a fixed category picked from the same taxonomy the reports sidebar
 * tree already groups every built-in report by (SideBarView.tsx's
 * openMenu keys: CompanySetup, HR, Activities, CRM, HRMS, Production,
 * Account, Automation, Settings, Masters, Product Settings, Others,
 * new reports, Inventory, CS). See the migrations that follow this one
 * for the report_group_id -> category data migration and the
 * report_group_id/report_groups removal.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("report_definitions");
  if (!table.category) {
    await queryInterface.addColumn("report_definitions", "category", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  const table = await queryInterface.describeTable("report_definitions");
  if (table.category) {
    await queryInterface.removeColumn("report_definitions", "category");
  }
};
