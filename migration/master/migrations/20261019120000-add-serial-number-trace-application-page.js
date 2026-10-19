/**
 * Migration Name: add-serial-number-trace-application-page
 * Database Type: MASTER
 *
 * Serial Number Trace report (Inventory) - the full life of one serial number
 * (documents, conversions, tasks, support tickets, visits) as a timeline. Its
 * own application page/feature gate so it can be granted as a report tile with
 * its own view permission.
 *
 * id 197 - next after attribute_master (196). Verified against the local
 * a_application_pages (2026-10-19): MAX(id) was 196. Re-verify
 * (SELECT MAX(id) FROM a_application_pages) on every other environment before
 * running this - adminpanel shares this table with rows not visible from the
 * CRM codebase, so the next free id there can differ.
 */

const SERIAL_NUMBER_TRACE_PAGE_ID = 197;

export const up = async (queryInterface, Sequelize) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'serial_number_trace' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      `INSERT INTO \`a_application_pages\` (\`id\`, \`page_name\`, \`modual_name\`, \`page_slug\`, \`description\`, \`type\`, \`display_order\`, \`isPublic\`, \`isRights\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`) VALUES (${SERIAL_NUMBER_TRACE_PAGE_ID}, 'Serial Number Trace', 'Product', 'serial_number_trace', 'Full history of a serial number across documents, tasks and visits', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1');`
    );
  }

  const [existingPlanPages] = await queryInterface.sequelize.query(
    `SELECT id FROM \`plan_vs_pages\` WHERE \`page_id\` = ${SERIAL_NUMBER_TRACE_PAGE_ID}`
  );
  if (existingPlanPages.length === 0) {
    await queryInterface.sequelize.query(
      `INSERT INTO \`plan_vs_pages\` (\`id\`, \`plan_id\`, \`page_id\`, \`data_limit\`, \`extra_information\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`) VALUES (NULL, '1', '${SERIAL_NUMBER_TRACE_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '2', '${SERIAL_NUMBER_TRACE_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '3', '${SERIAL_NUMBER_TRACE_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '4', '${SERIAL_NUMBER_TRACE_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1');`
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`DELETE FROM \`plan_vs_pages\` WHERE \`page_id\` = ${SERIAL_NUMBER_TRACE_PAGE_ID}`);
  await queryInterface.sequelize.query(
    `DELETE FROM \`a_application_pages\` WHERE \`id\` = ${SERIAL_NUMBER_TRACE_PAGE_ID} AND \`page_slug\` = 'serial_number_trace'`
  );
};
