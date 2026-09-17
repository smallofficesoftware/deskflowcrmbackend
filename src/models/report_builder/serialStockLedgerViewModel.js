import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

// The view exposes a constant `0 AS isDelete` column (see alter.txt) purely
// so queryEngine.js's always-on `isDelete: 0` scope clause — every other
// registered table has a real one — works unchanged here too, no engine
// special-case needed for the one view-backed source.

// Maps to `serial_stock_ledger_view` (see alter.txt), a read-only SQL VIEW
// over cart_vs_serial_numbers that pre-computes a signed stock_delta per
// serial-number hop — not a real table, timestamps:false/no isDelete
// filter needed here since the view's own WHERE already excludes
// soft-deleted rows.
export const serialStockLedgerViewModel = (sequelize) => {
  return sequelize.define(
    "serial_stock_ledger_view",
    {
      id: {
        type: INTEGER,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      a_application_login_id: {
        type: INTEGER,
      },
      product_id: {
        type: INTEGER,
      },
      serial_numbers: {
        type: STRING,
      },
      cart_id: {
        type: INTEGER,
      },
      cart_type: {
        type: INTEGER,
      },
      cart_item_id: {
        type: INTEGER,
      },
      sn_reference_type: {
        type: INTEGER,
      },
      sn_reference_cart_id: {
        type: STRING,
      },
      created_date_time: {
        type: DATE,
      },
      stock_delta: {
        type: TINYINT,
      },
      isDelete: {
        type: TINYINT,
      },
    },
    {
      tableName: "serial_stock_ledger_view",
      timestamps: false,
    },
  );
};
