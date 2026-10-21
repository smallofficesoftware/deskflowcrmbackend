/**
 * Migration Name: add-ecommerce-storefront-application-page
 * Database Type: MASTER
 *
 * Page-lookup row for the B2B/B2C ecommerce storefront addon (plans/2026-10-15-
 * ecommerce-b2b-b2c-plan.txt, P1/4.5). Looked up by page_slug ('ecommerce-storefront'),
 * used ONLY as the key the tenant-DB a_application_login_type_rights JSON check reads
 * (generic requireAddon(appCode) primitive, src/middlewares/requireAddon.js). Same
 * pattern as 20261020120000-add-tally-application-page.js. Deliberately does NOT
 * insert into plan_vs_pages - this row is not wired into the old plan/page
 * menu-entitlement system, by design (addons don't use that system, see 4.5).
 */

export const up = async (queryInterface) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'ecommerce-storefront' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      "INSERT INTO `a_application_pages` (`page_name`, `modual_name`, `page_slug`, `description`, `type`, `display_order`, `isPublic`, `isRights`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) VALUES ('Ecommerce Storefront', 'Ecommerce Storefront', 'ecommerce-storefront', 'B2B/B2C ecommerce storefront (marketplace addon)', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1')"
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DELETE FROM `a_application_pages` WHERE `page_slug` = 'ecommerce-storefront'");
};
