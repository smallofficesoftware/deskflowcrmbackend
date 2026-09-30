/**
 * Migration Name: add-workspaces-application-page
 * Database Type: MASTER
 *
 * Plan entitlement page for the workspace limit (page_slug "workspaces"). Only carries
 * plan_vs_pages.data_limit = number of workspaces a Main Company may create. Default 1 for every plan.
 * The id is left to AUTO_INCREMENT (looked up by slug elsewhere) so it cannot collide with live rows.
 */

export const up = async (queryInterface) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'workspaces' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      "INSERT INTO `a_application_pages` (`page_name`, `modual_name`, `page_slug`, `description`, `type`, `display_order`, `isPublic`, `isRights`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) VALUES ('Workspaces', 'Workspaces', 'workspaces', 'Number of workspaces a company can create (plan limit)', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1')"
    );
  }

  await queryInterface.sequelize.query(
    "INSERT INTO `plan_vs_pages` (`plan_id`, `page_id`, `data_limit`, `extra_information`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) " +
      "SELECT pm.`id`, p.`id`, '1', '', NOW(), current_timestamp(), '0', '1' " +
      "FROM `plan_masters` pm JOIN `a_application_pages` p ON p.`page_slug` = 'workspaces' " +
      "WHERE pm.`isDelete` = 0 AND NOT EXISTS (SELECT 1 FROM `plan_vs_pages` x WHERE x.`plan_id` = pm.`id` AND x.`page_id` = p.`id`)"
  );
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    "DELETE FROM `plan_vs_pages` WHERE `page_id` IN (SELECT `id` FROM `a_application_pages` WHERE `page_slug` = 'workspaces')"
  );
  await queryInterface.sequelize.query("DELETE FROM `a_application_pages` WHERE `page_slug` = 'workspaces'");
};
