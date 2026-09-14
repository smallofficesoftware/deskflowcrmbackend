/**
 * Migration Name: add-contact-merge-application-page
 * Database Type: MASTER
 *
 * Find/Merge Duplicate Contacts feature (All Contact Report's ⋮ menu, and
 * Settings' contact list ⋮ menu) — its OWN application page/feature gate,
 * independent of CONTACT's (id 1), so this destructive action can be
 * granted or withheld per role without affecting normal contact rights.
 *
 * id 179 chosen as "next after 178" (FORM_BUILDER) — UNVERIFIED against a
 * live DB. VERIFY (SELECT MAX(id) FROM a_application_pages) before running
 * this in any environment: every prior page added this way (159, 160, 178)
 * found that assumption wrong at least once, because adminpanel shares
 * this same table with rows not visible from the CRM codebase.
 */

const CONTACT_MERGE_PAGE_ID = 179;

export const up = async (queryInterface, Sequelize) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'contact_merge' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      `INSERT INTO \`a_application_pages\` (\`id\`, \`page_name\`, \`modual_name\`, \`page_slug\`, \`description\`, \`type\`, \`display_order\`, \`isPublic\`, \`isRights\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`) VALUES (${CONTACT_MERGE_PAGE_ID}, 'Find/Merge Duplicate Contacts', 'Contact', 'contact_merge', 'Find and merge duplicate contacts', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1');`
    );
  }

  const [existingPlanPages] = await queryInterface.sequelize.query(
    `SELECT id FROM \`plan_vs_pages\` WHERE \`page_id\` = ${CONTACT_MERGE_PAGE_ID}`
  );
  if (existingPlanPages.length === 0) {
    await queryInterface.sequelize.query(
      `INSERT INTO \`plan_vs_pages\` (\`id\`, \`plan_id\`, \`page_id\`, \`data_limit\`, \`extra_information\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`) VALUES (NULL, '1', '${CONTACT_MERGE_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '2', '${CONTACT_MERGE_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '3', '${CONTACT_MERGE_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '4', '${CONTACT_MERGE_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1');`
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`DELETE FROM \`plan_vs_pages\` WHERE \`page_id\` = ${CONTACT_MERGE_PAGE_ID}`);
  await queryInterface.sequelize.query(
    `DELETE FROM \`a_application_pages\` WHERE \`id\` = ${CONTACT_MERGE_PAGE_ID} AND \`page_slug\` = 'contact_merge'`
  );
};
