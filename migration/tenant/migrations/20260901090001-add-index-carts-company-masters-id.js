/**
 * Migration Name: add-index-carts-company-masters-id
 * Database Type: TENANT
 * Created: 01/09/2026
 *
 * slow.log analysis (querylog/index_report_condensed.txt): carts list
 * queries filter on company_masters_id with no supporting index — 1684
 * hits, 4.54s total, worst single query 0.12s. Existing keys (type,
 * cart_date, to_customer_id, referance_cart_id, isDelete) don't cover it.
 */

export const up = async (queryInterface) => {
  const indexes = await queryInterface.showIndex("carts");
  if (!indexes.some((i) => i.name === "company_masters_id")) {
    await queryInterface.addIndex("carts", {
      fields: ["company_masters_id"],
      name: "company_masters_id",
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeIndex("carts", "company_masters_id");
};
