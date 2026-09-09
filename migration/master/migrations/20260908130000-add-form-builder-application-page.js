/**
 * Migration Name: add-form-builder-application-page
 * Database Type: MASTER
 *
 * Custom Form Maker's own application page/feature gate (PAGE_ID.FORM_BUILDER
 * in AppEnumeration.js), independent of report_builder's (159) and
 * dashboard_builder's (160) so a company can be granted Form Builder access
 * without necessarily having either of those.
 *
 * id 178, not 161 — corrected after actually running this against a live
 * dev DB. The "161 is next after 160" assumption (from AppEnumeration.js's
 * own stale comment) was wrong on two counts: 161 was already taken by an
 * existing 'system_document_templates' row, and 162-177 turned out to be
 * adminpanel's own pages (companies/logins/plans/billing/rbac/ops/...)
 * sharing this same a_application_pages table — not visible from the CRM
 * codebase's own AppEnumeration.js, only from the live table. MAX(id) was
 * 177 at the time this was verified; VERIFY again before running this in
 * any other environment, same caution report_builder's and
 * dashboard_builder's own migrations already flagged (and which this one
 * turned out to actually need).
 */

const FORM_BUILDER_PAGE_ID = 178;

export const up = async (queryInterface, Sequelize) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'form_builder' LIMIT 1"
  );
  if (existingPage.length === 0) {
    // modual_name is NOT NULL with no default (verified against the live
    // table — an earlier draft of this migration omitted it entirely,
    // which is what actually failed on first run); every comparable
    // existing row (Reports & Statistics, the per-report pages, etc.) just
    // mirrors page_name into it, so this does the same.
    await queryInterface.sequelize.query(
      `INSERT INTO \`a_application_pages\` (\`id\`, \`page_name\`, \`modual_name\`, \`page_slug\`, \`description\`, \`type\`, \`display_order\`, \`isPublic\`, \`isRights\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`) VALUES (${FORM_BUILDER_PAGE_ID}, 'Form Builder', 'Form Builder', 'form_builder', 'Custom Form Maker', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1');`
    );
  }

  const [existingPlanPages] = await queryInterface.sequelize.query(
    `SELECT id FROM \`plan_vs_pages\` WHERE \`page_id\` = ${FORM_BUILDER_PAGE_ID}`
  );
  if (existingPlanPages.length === 0) {
    await queryInterface.sequelize.query(
      `INSERT INTO \`plan_vs_pages\` (\`id\`, \`plan_id\`, \`page_id\`, \`data_limit\`, \`extra_information\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`) VALUES (NULL, '1', '${FORM_BUILDER_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '2', '${FORM_BUILDER_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '3', '${FORM_BUILDER_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '4', '${FORM_BUILDER_PAGE_ID}', '0', '', NOW(), current_timestamp(), '0', '1');`
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`DELETE FROM \`plan_vs_pages\` WHERE \`page_id\` = ${FORM_BUILDER_PAGE_ID}`);
  await queryInterface.sequelize.query(
    `DELETE FROM \`a_application_pages\` WHERE \`id\` = ${FORM_BUILDER_PAGE_ID} AND \`page_slug\` = 'form_builder'`
  );
};
