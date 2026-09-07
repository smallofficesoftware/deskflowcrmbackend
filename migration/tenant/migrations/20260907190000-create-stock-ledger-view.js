/**
 * Migration Name: create-stock-ledger-view
 * Database Type: TENANT
 *
 * Backfills stock_ledger_view (see alter.txt, 21-08-2026) as a real
 * migration — it previously only existed as a manual alter.txt entry +
 * create_company_copy.sql's new-signup provisioning block, so any
 * EXISTING tenant that signed up before 21-08-2026 and never had the raw
 * SQL run against it by hand is missing the view entirely (Report
 * Builder's Stock Ledger source fails with "Table '<tenant>.
 * stock_ledger_view' doesn't exist"). CREATE OR REPLACE VIEW is already
 * idempotent — safe to run against a tenant that already has it.
 */

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE OR REPLACE VIEW \`stock_ledger_view\` AS
    SELECT
      ci.id,
      ci.company_masters_id,
      ci.item_product_id,
      ci.cart_type,
      ci.reference_type,
      ci.cart_date,
      ci.item_qty,
      ci.stock_type,
      ci.item_warehouse_id,
      ci.a_application_login_id,
      0 AS isDelete,
      CASE
        WHEN (ci.cart_type = 4 AND ci.reference_type != 8) OR ci.cart_type IN (6,8,10) THEN ci.item_qty
        WHEN (ci.cart_type = 3 AND ci.reference_type != 9) OR ci.cart_type IN (7,9,11) THEN -ci.item_qty
        ELSE 0
      END AS qty_delta
    FROM \`cart_items\` ci
    WHERE ci.isDelete = 0
      AND ci.cart_number IS NOT NULL AND ci.cart_number != ''
      AND (
        (ci.cart_type = 4 AND ci.reference_type != 8)
        OR (ci.cart_type = 3 AND ci.reference_type != 9)
        OR ci.cart_type IN (6,7,8,9,10,11)
      );
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DROP VIEW IF EXISTS `stock_ledger_view`");
};
