/**
 * Migration Name: add-index-location-trackings-company-masters-id
 * Database Type: TENANT
 * Created: 01/09/2026
 *
 * slow.log analysis (querylog/index_report_condensed.txt): only 6 hits but
 * 1.6s worst-case each — full table scan on company_masters_id with no
 * supporting index. Existing keys only cover a_application_login_id/isDelete.
 */

export const up = async (queryInterface) => {
  const indexes = await queryInterface.showIndex("location_trackings");
  if (!indexes.some((i) => i.name === "company_masters_id")) {
    await queryInterface.addIndex("location_trackings", {
      fields: ["company_masters_id"],
      name: "company_masters_id",
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeIndex("location_trackings", "company_masters_id");
};
