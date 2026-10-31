/**
 * Migration Name: ledger-views-mark-not-counted-stock
 * Database Type: TENANT
 *
 * Replaces the filter added by 20261031100000. A document line with `stock_type` 0 (no stock effect: a sales return
 * saved with "Include stock back" off, or a copy of another document) now still COMES in stock_ledger_view and
 * serial_stock_ledger_view, marked `stock_counted` = 0, and its movement (`qty_delta` / `stock_delta`) is 0 so no total
 * or running balance includes it. Every other line has `stock_counted` = 1 and is unchanged. A line with a NULL
 * `stock_type` is treated as not counted, the same as the shared stock rule (src/services/product_settings/stockCondition.js).
 *
 * New column on each view: `stock_counted`. Existing columns are unchanged, so saved Report Builder reports keep
 * working. CREATE OR REPLACE VIEW is idempotent.
 */

const NOT_COUNTED = "(ci.stock_type IS NULL OR ci.stock_type = 0)";

const stockLedgerSql = (markNotCounted) => `
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
      CASE${markNotCounted ? `\n        WHEN ${NOT_COUNTED} THEN 0` : ""}
        WHEN (ci.cart_type = 4 AND ci.reference_type != 8) OR ci.cart_type IN (6,8,10) THEN ci.item_qty
        WHEN (ci.cart_type = 3 AND ci.reference_type != 9) OR ci.cart_type IN (7,9,11) THEN -ci.item_qty
        ELSE 0
      END AS qty_delta,
      CASE
        WHEN ci.cart_type IN (10,11) AND c.sr_by_number IS NOT NULL
          AND EXISTS (SELECT 1 FROM \`carts\` t WHERE t.sr_by_number = c.sr_by_number AND t.cart_date = c.cart_date AND t.company_masters_id = c.company_masters_id AND t.type = 10 AND t.isDelete = 0)
          AND EXISTS (SELECT 1 FROM \`carts\` t WHERE t.sr_by_number = c.sr_by_number AND t.cart_date = c.cart_date AND t.company_masters_id = c.company_masters_id AND t.type = 11 AND t.isDelete = 0)
        THEN 1 ELSE 0
      END AS is_transfer${markNotCounted ? `,\n      CASE WHEN ${NOT_COUNTED} THEN 0 ELSE 1 END AS stock_counted` : ""}
    FROM \`cart_items\` ci
    LEFT JOIN \`carts\` c ON c.id = ci.cart_id
    WHERE ci.isDelete = 0
      AND ci.cart_number IS NOT NULL AND ci.cart_number != ''${markNotCounted ? "" : "\n      AND ci.stock_type != 0"}
      AND (
        (ci.cart_type = 4 AND ci.reference_type != 8)
        OR (ci.cart_type = 3 AND ci.reference_type != 9)
        OR ci.cart_type IN (6,7,8,9,10,11)
      );
  `;

// A serial row is counted unless the cart item it belongs to has no stock effect. A serial row with no cart item
// link (cart_item_id missing) stays counted, as before.
const SERIAL_NOT_COUNTED = "(ci.id IS NOT NULL AND (ci.stock_type IS NULL OR ci.stock_type = 0))";

const serialLedgerSql = (markNotCounted) => `
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
      CASE${markNotCounted ? `\n        WHEN ${SERIAL_NOT_COUNTED} THEN 0` : ""}
        WHEN (sn.cart_type = 4 AND sn.sn_reference_type != 8) OR sn.cart_type IN (6,8,10) THEN 1
        WHEN (sn.cart_type = 3 AND sn.sn_reference_type != 9) OR sn.cart_type IN (7,9,11) THEN -1
        ELSE 0
      END AS stock_delta${markNotCounted ? `,\n      CASE WHEN ${SERIAL_NOT_COUNTED} THEN 0 ELSE 1 END AS stock_counted` : ""}
    FROM \`cart_vs_serial_numbers\` sn${markNotCounted ? "\n    LEFT JOIN `cart_items` ci ON ci.id = sn.cart_item_id" : ""}
    WHERE sn.isDelete = 0
      AND (
        (sn.cart_type = 4 AND sn.sn_reference_type != 8)
        OR (sn.cart_type = 3 AND sn.sn_reference_type != 9)
        OR sn.cart_type IN (6,7,8,9,10,11)
      );
  `;

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(stockLedgerSql(true));
  await queryInterface.sequelize.query(serialLedgerSql(true));
};

export const down = async (queryInterface) => {
  // Back to the state after 20261031100000: stock ledger without the not-counted lines, serial ledger as it was.
  await queryInterface.sequelize.query(stockLedgerSql(false));
  await queryInterface.sequelize.query(serialLedgerSql(false));
};
