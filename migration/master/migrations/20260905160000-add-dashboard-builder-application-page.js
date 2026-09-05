/**
 * Migration Name: add-dashboard-builder-application-page
 * Database Type: MASTER
 *
 * Dashboard feature, Phase 1 — its OWN application page/feature gate,
 * independent of report_builder's (id 159) so a company can be granted
 * Dashboard access without necessarily also having Report Builder, or
 * vice versa. id 160 chosen as "next after 159" — VERIFY against the live
 * a_application_pages table before running this in an environment where
 * 160 might already be taken (same caution report_builder's own migration
 * flagged for 159).
 */

export const up = async (queryInterface, Sequelize) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'dashboard_builder' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      "INSERT INTO `a_application_pages` (`id`, `page_name`, `page_slug`, `description`, `type`, `display_order`, `isPublic`, `isRights`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) VALUES (160, 'Dashboard Builder', 'dashboard_builder', 'Dashboard Builder', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1');"
    );
  }

  const [existingPlanPages] = await queryInterface.sequelize.query(
    "SELECT id FROM `plan_vs_pages` WHERE `page_id` = 160"
  );
  if (existingPlanPages.length === 0) {
    await queryInterface.sequelize.query(
      "INSERT INTO `plan_vs_pages` (`id`, `plan_id`, `page_id`, `data_limit`, `extra_information`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) VALUES (NULL, '1', '160', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '2', '160', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '3', '160', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '4', '160', '0', '', NOW(), current_timestamp(), '0', '1');"
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DELETE FROM `plan_vs_pages` WHERE `page_id` = 160");
  await queryInterface.sequelize.query(
    "DELETE FROM `a_application_pages` WHERE `id` = 160 AND `page_slug` = 'dashboard_builder'"
  );
};
