/**
 * Migration Name: add-tenant-master-application-page
 * Database Type: MASTER
 *
 * Tenant Master (adminpanel) previously had no `a_application_pages` row of
 * its own — its sidebar entry piggybacked on the Companies page's
 * hasRight("companies") check, so it could never appear as its own row in
 * the admin panel's Rbac page-roles matrix (adminpanel/backend/src/modules/
 * rbac/rbac.service.ts's ADMIN_PANEL_PAGE_SLUGS). This gives it a real slug
 * so a role's Tenant Master access can be granted independently of
 * Companies.
 *
 * id 186 — next after SERIAL_NUMBER_STOCK_CHECK (185). Verified against
 * live a_application_pages (2026-09-17, dev): MAX(id) was 185. Re-verify
 * (SELECT MAX(id) FROM a_application_pages) before running this in an
 * environment that may have diverged, since adminpanel shares this same
 * table with rows not visible from the CRM codebase.
 *
 * Unlike other recent additions to this table, this page is adminpanel-only
 * (superadmin RBAC), not a tenant-facing CRM feature, so no `plan_vs_pages`
 * row is inserted here.
 */

const TENANT_MASTER_PAGE_ID = 186;

export const up = async (queryInterface, Sequelize) => {
  const [existingPage] = await queryInterface.sequelize.query(
    "SELECT id FROM `a_application_pages` WHERE `page_slug` = 'tenant-master' LIMIT 1"
  );
  if (existingPage.length === 0) {
    await queryInterface.sequelize.query(
      `INSERT INTO \`a_application_pages\` (\`id\`, \`page_name\`, \`modual_name\`, \`page_slug\`, \`description\`, \`type\`, \`display_order\`, \`isPublic\`, \`isRights\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`) VALUES (${TENANT_MASTER_PAGE_ID}, 'Tenant Master', 'Tenants', 'tenant-master', 'Admin panel Tenant Master listing', '1', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1');`
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    `DELETE FROM \`a_application_pages\` WHERE \`id\` = ${TENANT_MASTER_PAGE_ID} AND \`page_slug\` = 'tenant-master'`
  );
};
