/**
 * Migration Name: create-employee-outstanding-view
 * Database Type: TENANT
 *
 * Backfills employee_outstanding_view (see alter.txt, 21-08-2026) as a
 * real migration — same gap as stock_ledger_view/account_outstanding_view
 * (previous two migrations): it previously only existed as a manual
 * alter.txt entry + create_company_copy.sql's new-signup provisioning
 * block, so any EXISTING tenant that signed up before 21-08-2026 and
 * never had the raw SQL run against it by hand is missing the view
 * entirely. CREATE OR REPLACE VIEW is already idempotent — safe to run
 * against a tenant that already has it.
 */

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE OR REPLACE VIEW \`employee_outstanding_view\` AS
    SELECT
      eat.id,
      eat.company_masters_id,
      eat.team_id,
      eat.a_application_login_id,
      eat.type,
      eat.mode,
      eat.amount,
      eat.payment_date_time,
      eat.approve_date_time,
      eat.remark,
      0 AS isDelete,
      CASE
        WHEN eat.type = 2 THEN eat.amount
        WHEN eat.type = 1 THEN -eat.amount
        ELSE 0
      END AS amount_signed
    FROM \`employee_account_transactions\` eat
    WHERE eat.isDelete = 0
      AND eat.approve_by_a_application_login_id != 0;
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DROP VIEW IF EXISTS `employee_outstanding_view`");
};
