/**
 * Migration Name: add-description-to-report-definitions
 * Database Type: TENANT
 *
 * Fixes a real bug: listRunnableReportDefinitions (reportDefinitionServices.js)
 * has selected `description` (and a `category` that was never planned for
 * this table at all — that only ever existed on the master-DB system
 * gallery's system_report_definitions, tenant-side organization uses
 * report_group_id instead) since Step 5's plan was written, but the
 * column itself was never actually migrated onto this table — surfaced
 * live as "Unknown column 'category' in 'field list'" the first time a
 * real tenant hit /report-definitions/list-runnable. This adds the
 * column that plan (Step 5's "Search scope" decision — report-picker
 * search also matches description) actually needs; the erroneous
 * `category` reference is removed from the query instead, not backed by
 * a column here.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("report_definitions");
  if (!table.description) {
    await queryInterface.addColumn("report_definitions", "description", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("report_definitions", "description");
};
