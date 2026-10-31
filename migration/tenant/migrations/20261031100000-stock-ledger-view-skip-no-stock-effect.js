/**
 * Migration Name: stock-ledger-view-skip-no-stock-effect
 * Database Type: TENANT
 *
 * stock_ledger_view listed every stock-type document line, including lines with `stock_type` = 0: a document
 * saved with no stock effect (a sales return with "Include stock back" off) or a copy made from another document.
 * The rest of the CRM leaves those lines out (src/services/product_settings/stockCondition.js - product stock, Stock
 * Summary, stock checks, and now the Warehouse Transfer report), so a ledger report disagreed with them. This adds the
 * same condition, `stock_type` is not 0. The columns are unchanged, so saved Report Builder reports keep working; they
 * just no longer include those lines. CREATE OR REPLACE VIEW is idempotent.
 */

const viewSql = (skipNoStockEffect) => `
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
      AND ci.cart_number IS NOT NULL AND ci.cart_number != ''${skipNoStockEffect ? "\n      AND ci.stock_type != 0" : ""}
      AND (
        (ci.cart_type = 4 AND ci.reference_type != 8)
        OR (ci.cart_type = 3 AND ci.reference_type != 9)
        OR ci.cart_type IN (6,7,8,9,10,11)
      );
  `;

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(viewSql(true));
};

export const down = async (queryInterface) => {
  // Back to the definition before this migration (20261029120000).
  await queryInterface.sequelize.query(viewSql(false));
};
