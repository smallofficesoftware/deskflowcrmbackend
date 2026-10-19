/**
 * Migration Name: add-attribute-master-application-page
 * Database Type: MASTER
 *
 * Page entitlement for the new reusable product-attribute catalog (Settings > Attribute
 * Master - plans/2026-10-18-product-variants-and-qty-pricing-plan.txt). Looked up by
 * page_slug, not a hardcoded id, so this stays idempotent whenever it actually runs
 * (the row was already inserted directly against the live DB on 19-10-2026, id 196 -
 * see alter.txt - ahead of this migration being run as part of the master backlog).
 */

export const up = async (queryInterface) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'attribute_master' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      "INSERT INTO `a_application_pages` (`page_name`, `modual_name`, `page_slug`, `description`, `type`, `display_order`, `isPublic`, `isRights`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) VALUES ('Attribute Master', 'Attribute Master', 'attribute_master', 'Attribute Master', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1')"
    );
  }

  await queryInterface.sequelize.query(
    "INSERT INTO `plan_vs_pages` (`plan_id`, `page_id`, `data_limit`, `extra_information`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) " +
      "SELECT pm.`id`, p.`id`, '0', '', NOW(), current_timestamp(), '0', '1' " +
      "FROM `plan_masters` pm JOIN `a_application_pages` p ON p.`page_slug` = 'attribute_master' " +
      "WHERE pm.`isDelete` = 0 AND NOT EXISTS (SELECT 1 FROM `plan_vs_pages` x WHERE x.`plan_id` = pm.`id` AND x.`page_id` = p.`id`)"
  );
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    "DELETE FROM `plan_vs_pages` WHERE `page_id` IN (SELECT `id` FROM `a_application_pages` WHERE `page_slug` = 'attribute_master')"
  );
  await queryInterface.sequelize.query("DELETE FROM `a_application_pages` WHERE `page_slug` = 'attribute_master'");
};
