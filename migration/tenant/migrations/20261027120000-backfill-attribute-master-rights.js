/**
 * Migration Name: backfill-attribute-master-rights
 * Database Type: TENANT (runs once per tenant DB)
 *
 * Attribute Master (plans/2026-10-18-product-variants-and-qty-pricing-plan.txt) got its
 * own page entitlement in the master DB (migration 20261019160000), but existing logins
 * were never granted a rights row for it - same gap as Serial Number Wise Stock Check
 * (page 185, alter.txt 17-09-2026).
 *
 * The page_id for 'attribute_master' is NOT the same number on every database -
 * a_application_pages ids are plain AUTO_INCREMENT and that table is also written to
 * independently by the admin panel's own platform-page migrations, so the same
 * page_slug can land on a different id depending on which migrations ran first on a
 * given server (found 27-10-2026: 196 on the dev DB, 200 on demobackend). Resolve the id
 * by page_slug against the master DB at migration time instead of hardcoding either
 * number, so this backfill is correct on every database regardless of drift.
 */

const masterDbName = process.env.TENANT_DB_DB_NAME;

export const up = async (queryInterface) => {
  const [[pageRow]] = await queryInterface.sequelize.query(
    `SELECT id, page_name FROM \`${masterDbName}\`.\`a_application_pages\` WHERE page_slug = 'attribute_master' AND isDelete = 0 LIMIT 1`
  );
  if (!pageRow) return; // page not migrated to the master DB yet on this environment

  await queryInterface.sequelize.query(
    `INSERT INTO \`a_application_login_type_rights\`
      (\`a_application_login_id\`, \`company_masters_id\`, \`page_id\`, \`page_name\`, \`a_page_id_rights_jason\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`)
    SELECT DISTINCT
      t.\`a_application_login_id\`, t.\`company_masters_id\`, :pageId, :pageName,
      '{"view":1,"add":1,"edit":1,"delete":1,"approve":0,"import":0,"print":0,"share":0,"all_data":0,"personal":0,"limit":"0"}',
      NOW(), NOW(), 0, 1
    FROM \`a_application_login_type_rights\` t
    WHERE t.isDelete = 0
      AND NOT EXISTS (
        SELECT 1 FROM \`a_application_login_type_rights\` x
        WHERE x.a_application_login_id = t.a_application_login_id
          AND x.page_id = :pageId
          AND x.isDelete = 0
      )`,
    { replacements: { pageId: pageRow.id, pageName: pageRow.page_name } }
  );
};

export const down = async (queryInterface) => {
  const [[pageRow]] = await queryInterface.sequelize.query(
    `SELECT id FROM \`${masterDbName}\`.\`a_application_pages\` WHERE page_slug = 'attribute_master' AND isDelete = 0 LIMIT 1`
  );
  if (!pageRow) return;

  await queryInterface.sequelize.query(
    `DELETE FROM \`a_application_login_type_rights\` WHERE page_id = :pageId`,
    { replacements: { pageId: pageRow.id } }
  );
};
