/**
 * Migration Name: add-tally-application-page
 * Database Type: MASTER
 *
 * Page-lookup row for the Tally marketplace addon (plans/2026-10-08-marketplace-
 * tally-plan.txt, section 4.1/4.2). Looked up by page_slug ('tally'), used ONLY
 * as the key the tenant-DB a_application_login_type_rights JSON check reads
 * (generic requireAddon(appCode) primitive, per the ecommerce plan's cross-plan
 * resolution - plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, Q1/4.1). Deliberately
 * does NOT insert into plan_vs_pages - this row is not wired into the old
 * plan/page menu-entitlement system, by design (that system is dead for addons;
 * see the Tally plan's SUPERSEDED FOUNDATION note).
 */

export const up = async (queryInterface) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'tally' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      "INSERT INTO `a_application_pages` (`page_name`, `modual_name`, `page_slug`, `description`, `type`, `display_order`, `isPublic`, `isRights`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) VALUES ('Tally', 'Tally', 'tally', 'Tally accounting sync (marketplace addon)', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1')"
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DELETE FROM `a_application_pages` WHERE `page_slug` = 'tally'");
};
