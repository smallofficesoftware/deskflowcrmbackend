/**
 * Migration Name: create-serial-stock-ledger-view
 * Database Type: TENANT
 *
 * Same in/out classification stock_ledger_view already uses (see
 * alter.txt, 21-08-2026), applied at the individual serial-number level
 * instead of per cart_item quantity: cart_vs_serial_numbers carries one
 * row per (serial, cart) hop as a serial moves through purchase -> sale
 * (or purchase -> return, etc.), using sn_reference_type the same way
 * stock_ledger_view uses reference_type to avoid double-counting a
 * cart created FROM an already-counted dispatch/inward. Report
 * Builder's runningTotal (partitioned by serial_numbers, ordered by
 * created_date_time) turns stock_delta into a running 1 = in stock /
 * 0 = sold-out balance per serial. CREATE OR REPLACE VIEW is already
 * idempotent — safe to re-run.
 */

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE OR REPLACE VIEW \`serial_stock_ledger_view\` AS
    SELECT
      sn.id,
      sn.company_masters_id,
      sn.a_application_login_id,
      sn.product_id,
      sn.serial_numbers,
      sn.cart_id,
      sn.cart_type,
      sn.cart_item_id,
      sn.sn_reference_type,
      sn.sn_reference_cart_id,
      sn.created_date_time,
      0 AS isDelete,
      CASE
        WHEN (sn.cart_type = 4 AND sn.sn_reference_type != 8) OR sn.cart_type IN (6,8,10) THEN 1
        WHEN (sn.cart_type = 3 AND sn.sn_reference_type != 9) OR sn.cart_type IN (7,9,11) THEN -1
        ELSE 0
      END AS stock_delta
    FROM \`cart_vs_serial_numbers\` sn
    WHERE sn.isDelete = 0
      AND (
        (sn.cart_type = 4 AND sn.sn_reference_type != 8)
        OR (sn.cart_type = 3 AND sn.sn_reference_type != 9)
        OR sn.cart_type IN (6,7,8,9,10,11)
      );
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DROP VIEW IF EXISTS `serial_stock_ledger_view`");
};
