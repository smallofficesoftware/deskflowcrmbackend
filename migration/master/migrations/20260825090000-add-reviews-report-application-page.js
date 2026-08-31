/**
 * Migration Name: add-reviews-report-application-page
 * Database Type: MASTER
 */

export const up = async (queryInterface, Sequelize) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'reviews_report' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      "INSERT INTO `a_application_pages` (`id`, `page_name`, `page_slug`, `description`, `type`, `display_order`, `isPublic`, `isRights`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) VALUES (158, 'Reviews', 'reviews_report', 'Reviews', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1');"
    );
  }

  const [existingPlanPages] = await queryInterface.sequelize.query(
    "SELECT id FROM `plan_vs_pages` WHERE `page_id` = 158"
  );
  if (existingPlanPages.length === 0) {
    await queryInterface.sequelize.query(
      "INSERT INTO `plan_vs_pages` (`id`, `plan_id`, `page_id`, `data_limit`, `extra_information`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) VALUES (NULL, '1', '158', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '2', '158', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '3', '158', '0', '', NOW(), current_timestamp(), '0', '1'), (NULL, '4', '158', '0', '', NOW(), current_timestamp(), '0', '1');"
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DELETE FROM `plan_vs_pages` WHERE `page_id` = 158");
  await queryInterface.sequelize.query(
    "DELETE FROM `a_application_pages` WHERE `id` = 158 AND `page_slug` = 'reviews_report'"
  );
};
