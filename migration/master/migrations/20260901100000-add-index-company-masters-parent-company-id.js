/**
 * Migration Name: add-index-company-masters-parent-company-id
 * Database Type: MASTER
 * Created: 01/09/2026
 *
 * slow.log analysis (querylog/index_report_condensed.txt): parent/child
 * company lookups filter on parent_company_id with no supporting index —
 * 1289 hits, 1.18s total. Existing keys only cover id/isDelete/qr_code/
 * plan_expiry_date.
 */

export const up = async (queryInterface) => {
  const indexes = await queryInterface.showIndex("company_masters");
  if (!indexes.some((i) => i.name === "parent_company_id")) {
    await queryInterface.addIndex("company_masters", {
      fields: ["parent_company_id"],
      name: "parent_company_id",
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeIndex("company_masters", "parent_company_id");
};
