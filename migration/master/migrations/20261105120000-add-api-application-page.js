/**
 * Migration Name: add-api-application-page
 * Database Type: MASTER
 *
 * Page-lookup row for the "API" marketplace addon (customer API keys + product API). Looked up by
 * page_slug ('api') as the key the tenant-DB a_application_login_type_rights JSON check reads
 * (generic requireAddon(appCode) primitive). Deliberately NOT inserted into plan_vs_pages - same as the
 * Tally addon's page row.
 */

export const up = async (queryInterface) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'api' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      "INSERT INTO `a_application_pages` (`page_name`, `modual_name`, `page_slug`, `description`, `type`, `display_order`, `isPublic`, `isRights`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) VALUES ('API', 'API', 'api', 'Company API keys and product API (marketplace addon)', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1')"
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DELETE FROM `a_application_pages` WHERE `page_slug` = 'api'");
};
