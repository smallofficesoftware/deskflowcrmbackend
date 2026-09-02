/**
 * Migration Name: add-index-task-managements-list-filter
 * Database Type: TENANT
 * Created: 01/09/2026
 *
 * slow.log analysis (querylog/index_report_condensed.txt): task list/count
 * queries filter on company_masters_id + is_archive + is_not_visible +
 * status + task_template + task_type together, uncovered by any existing
 * key (reference_id/reference_table/task_fromdate/task_enddate) — 2359
 * hits, 5.96s total, worst single query 0.10s.
 */

export const up = async (queryInterface) => {
  const indexes = await queryInterface.showIndex("task_managements");
  if (!indexes.some((i) => i.name === "idx_task_managements_list_filter")) {
    await queryInterface.addIndex("task_managements", {
      fields: [
        "company_masters_id",
        "is_archive",
        "is_not_visible",
        "status",
        "task_template",
        "task_type",
      ],
      name: "idx_task_managements_list_filter",
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeIndex("task_managements", "idx_task_managements_list_filter");
};
