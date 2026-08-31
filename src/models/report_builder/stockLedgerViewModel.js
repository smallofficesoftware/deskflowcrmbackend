import { DATEONLY, DOUBLE, INTEGER, TINYINT } from "sequelize";

// The view exposes a constant `0 AS isDelete` column (see alter.txt) purely
// so queryEngine.js's always-on `isDelete: 0` scope clause — every other
// registered table has a real one — works unchanged here too, no engine
// special-case needed for the one view-backed source.

// Maps to `stock_ledger_view` (see alter.txt), a read-only SQL VIEW over
// cart_items that pre-computes a signed qty_delta per stock-affecting row —
// not a real table, timestamps:false/no isDelete filter needed here since
// the view's own WHERE already excludes soft-deleted/non-stock rows.
export const stockLedgerViewModel = (sequelize) => {
  return sequelize.define(
    "stock_ledger_view",
    {
      id: {
        type: INTEGER,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      item_product_id: {
        type: INTEGER,
      },
      cart_type: {
        type: INTEGER,
      },
      reference_type: {
        type: INTEGER,
      },
      cart_date: {
        type: DATEONLY,
      },
      item_qty: {
        type: DOUBLE,
      },
      qty_delta: {
        type: DOUBLE,
      },
      stock_type: {
        type: TINYINT,
      },
      item_warehouse_id: {
        type: INTEGER,
      },
      a_application_login_id: {
        type: INTEGER,
      },
      isDelete: {
        type: TINYINT,
      },
    },
    {
      tableName: "stock_ledger_view",
      timestamps: false,
    },
  );
};
