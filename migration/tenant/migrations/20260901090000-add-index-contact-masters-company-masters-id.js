/**
 * Migration Name: add-index-contact-masters-company-masters-id
 * Database Type: TENANT
 * Created: 01/09/2026
 *
 * slow.log analysis (querylog/index_report_condensed.txt): every list/lookup
 * query against contact_masters filters on company_masters_id with no
 * supporting index — 2938 hits, 7.87s total examined-row time. Filtering
 * relies on the isDelete/mobile_number/person_name indexes only, none of
 * which cover this predicate.
 */

export const up = async (queryInterface) => {
  const indexes = await queryInterface.showIndex("contact_masters");
  if (!indexes.some((i) => i.name === "company_masters_id")) {
    await queryInterface.addIndex("contact_masters", {
      fields: ["company_masters_id"],
      name: "company_masters_id",
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeIndex("contact_masters", "company_masters_id");
};
