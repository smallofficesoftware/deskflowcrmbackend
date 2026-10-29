/**
 * Migration Name: add-is-transfer-to-stock-ledger-view
 * Database Type: TENANT
 *
 * Adds `is_transfer` to stock_ledger_view so Report Builder's Stock Ledger can show or hide
 * warehouse-to-warehouse transfers. A transfer is saved as two carts that share `sr_by_number`
 * (type 11 = out of warehouse_from, type 10 = into warehouse_to); plain stock add / stock out also
 * use types 10 / 11 on their own, so a row only counts as a transfer when BOTH a type 10 and a
 * type 11 cart share its `sr_by_number` - the same rule as the Warehouse Transfer report
 * (warehouseTransferReportServices.js). Existing columns are unchanged; CREATE OR REPLACE VIEW is
 * idempotent.
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
      END AS qty_delta,
      CASE
        WHEN ci.cart_type IN (10,11) AND c.sr_by_number IS NOT NULL
          AND EXISTS (SELECT 1 FROM \`carts\` t WHERE t.sr_by_number = c.sr_by_number AND t.cart_date = c.cart_date AND t.company_masters_id = c.company_masters_id AND t.type = 10 AND t.isDelete = 0)
          AND EXISTS (SELECT 1 FROM \`carts\` t WHERE t.sr_by_number = c.sr_by_number AND t.cart_date = c.cart_date AND t.company_masters_id = c.company_masters_id AND t.type = 11 AND t.isDelete = 0)
        THEN 1 ELSE 0
      END AS is_transfer
    FROM \`cart_items\` ci
    LEFT JOIN \`carts\` c ON c.id = ci.cart_id
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
  // Back to the original definition (without is_transfer).
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
