/**
 * Migration Name: add-serial-number-stock-check-application-page
 * Database Type: MASTER
 *
 * Serial Number Wise Stock Check (previously only reachable from Products
 * Report's ⋮ menu) — its own application page/feature gate so it can be
 * granted directly as a report tile with its own view permission, instead
 * of piggybacking on Products' rights.
 *
 * id 185 — next after CONTACT_MERGE (184, itself corrected from a wrong
 * 179 the same day). Verified against live a_application_pages
 * (2026-09-15, dev): MAX(id) was 183 before that correction, 184 after
 * reserving it for CONTACT_MERGE. Re-verify (SELECT MAX(id) FROM
 * a_application_pages) before running this in an environment that may
 * have diverged from dev — every page added this way (159, 160, 178, 184)
 * found that assumption wrong at least once, because adminpanel shares
 * this same table with rows not visible from the CRM codebase.
 */

const SERIAL_NUMBER_STOCK_CHECK_PAGE_ID = 185;

export const up = async (queryInterface, Sequelize) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'serial_number_stock_check' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      `INSERT INTO \`a_application_pages\` (\`id\`, \`page_name\`, \`modual_name\`, \`page_slug\`, \`description\`, \`type\`, \`display_order\`, \`isPublic\`, \`isRights\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`) VALUES (${SERIAL_NUMBER_STOCK_CHECK_PAGE_ID}, 'Serial Number Wise Stock Check', 'Product', 'serial_number_stock_check', 'Track stock movement for a specific serial number', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1');`
    );
  }

  const [existingPlanPages] = await queryInterface.sequelize.query(
    `SELECT id FROM \`plan_vs_pages\` WHERE \`page_id\` = ${SERIAL_NUMBER_STOCK_CHECK_PAGE_ID}`
  );
  if (existingPlanPages.length === 0) {
    await queryInterface.sequelize.query(
      `INSERT INTO \`plan_vs_pages\` (\`id\`, \`plan_id\`, \`page_id\`, \`data_limit\`, \`extra_information\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`) VALUES (NULL, '1', '${SERIAL_NUMBER_STOCK_CHECK_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '2', '${SERIAL_NUMBER_STOCK_CHECK_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '3', '${SERIAL_NUMBER_STOCK_CHECK_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '4', '${SERIAL_NUMBER_STOCK_CHECK_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1');`
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`DELETE FROM \`plan_vs_pages\` WHERE \`page_id\` = ${SERIAL_NUMBER_STOCK_CHECK_PAGE_ID}`);
  await queryInterface.sequelize.query(
    `DELETE FROM \`a_application_pages\` WHERE \`id\` = ${SERIAL_NUMBER_STOCK_CHECK_PAGE_ID} AND \`page_slug\` = 'serial_number_stock_check'`
  );
};
