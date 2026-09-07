/**
 * Migration Name: add-filters-to-show-to-report-definitions
 * Database Type: TENANT
 *
 * Author-picked default set of general-filter slot numbers (see
 * generalFilterAdapter.ts / MODEL_REGISTRY's generalFilters map) for this
 * report — a JSON array of numbers, e.g. "[1,3,4]", or NULL for "show
 * every slot this table has" (today's behavior). Purely a default: the
 * run screen lets a viewer widen/narrow it for their own session, never
 * written back here.
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("report_definitions");
  if (!table.filters_to_show) {
    await queryInterface.addColumn("report_definitions", "filters_to_show", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("report_definitions", "filters_to_show");
};
