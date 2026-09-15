/**
 * Migration Name: create-third-party-logs
 * Database Type: TENANT
 *
 * Backfills a migration for third_party_logs — the table was created by
 * hand per alter.txt (11-09-2026 Dhaval) on regular tenant DBs, but never
 * got a migration file, and was never applied to smalloffice_sample_tenant
 * (the reference DB new_company_creation_sql's create_company_copy.sql
 * LIKEs from) — that gap is what's throwing "Table
 * 'smalloffice_sample_tenant.third_party_logs' doesn't exist" on new
 * company signup. This migration must also be run against
 * smalloffice_sample_tenant directly, same as any other new-table change
 * (see CLAUDE.md's schema-change checklist).
 *
 * Raw SQL, not queryInterface.createTable — kept byte-identical to
 * alter.txt's own CREATE TABLE (Sequelize's createTable has no clean way
 * to express ON UPDATE CURRENT_TIMESTAMP on modified_date). No-op when
 * the table already exists, same guard style adminpanel's own additive
 * migrations use for a shared-DB migrate that shouldn't abort on
 * "table already exists".
 */

export const up = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  const names = tables.map((t) => (typeof t === "string" ? t : t.tableName));
  if (names.includes("third_party_logs")) {
    return;
  }

  await queryInterface.sequelize.query(`
    CREATE TABLE \`third_party_logs\` (
      \`id\` INT(11) NOT NULL AUTO_INCREMENT,
      \`integration\` VARCHAR(40) NOT NULL,
      \`direction\` ENUM('INBOUND','OUTBOUND') NOT NULL,
      \`module_name\` VARCHAR(100) NOT NULL DEFAULT '',
      \`url\` VARCHAR(500) NOT NULL DEFAULT '',
      \`method\` VARCHAR(10) NOT NULL DEFAULT 'POST',
      \`status_code\` INT(11) NULL DEFAULT NULL,
      \`status\` ENUM('SUCCESS','FAILED') NOT NULL DEFAULT 'SUCCESS',
      \`response_time\` INT(11) NULL DEFAULT NULL,
      \`request_payload\` LONGTEXT NULL DEFAULT NULL,
      \`response_payload\` LONGTEXT NULL DEFAULT NULL,
      \`error_message\` TEXT NULL DEFAULT NULL,
      \`company_masters_id\` INT(11) NULL DEFAULT NULL,
      \`a_application_login_id\` INT(11) NULL DEFAULT NULL,
      \`created_date_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`modified_date\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_integration\` (\`integration\`),
      INDEX \`idx_direction\` (\`direction\`),
      INDEX \`idx_status\` (\`status\`),
      INDEX \`idx_company_masters_id\` (\`company_masters_id\`),
      INDEX \`idx_created_date_time\` (\`created_date_time\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.dropTable("third_party_logs");
};
