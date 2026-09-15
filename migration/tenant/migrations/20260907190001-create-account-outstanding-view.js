/**
 * Migration Name: create-account-outstanding-view
 * Database Type: TENANT
 *
 * Backfills account_outstanding_view (see alter.txt, 21-08-2026) as a
 * real migration — same gap as stock_ledger_view (previous migration):
 * it previously only existed as a manual alter.txt entry +
 * create_company_copy.sql's new-signup provisioning block, so any
 * EXISTING tenant that signed up before 21-08-2026 and never had the raw
 * SQL run against it by hand is missing the view entirely. CREATE OR
 * REPLACE VIEW is already idempotent — safe to run against a tenant that
 * already has it.
 */

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE OR REPLACE VIEW \`account_outstanding_view\` AS
    SELECT
      at.id,
      at.company_masters_id,
      at.contact_masters_id,
      at.a_application_login_id,
      at.type,
      at.mode,
      at.amount,
      at.payment_date_time,
      at.approve_date_time,
      at.remark,
      0 AS isDelete,
      CASE
        WHEN at.type = 2 THEN at.amount
        WHEN at.type = 1 THEN -at.amount
        ELSE 0
      END AS amount_signed
    FROM \`account_transactions\` at
    WHERE at.isDelete = 0
      AND at.approve_by_a_application_login_id != 0;
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DROP VIEW IF EXISTS `account_outstanding_view`");
};
