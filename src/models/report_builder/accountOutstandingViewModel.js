import { DATE, DOUBLE, INTEGER, STRING, TINYINT } from "sequelize";

// Maps to `account_outstanding_view` (see alter.txt) — a read-only SQL VIEW
// over account_transactions, same recipe as stock_ledger_view: pre-computes
// a signed amount_signed (+ for debit/type=2, - for credit/type=1, so
// SUM(amount_signed) grouped by contact = the outstanding balance directly,
// no per-row JS netting needed) and only includes approved, non-deleted
// transactions (accountReportServices.js's getAccountOutstandingReport
// unconditionally excludes unapproved rows from the balance — real business
// logic, baked into the view same as stock_ledger_view bakes in its own
// exclusions). `0 AS isDelete` passthrough for the same reason
// stock_ledger_view has one — queryEngine.js's blanket isDelete:0 scope.
export const accountOutstandingViewModel = (sequelize) => {
  return sequelize.define(
    "account_outstanding_view",
    {
      id: {
        type: INTEGER,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      contact_masters_id: {
        type: INTEGER,
      },
      a_application_login_id: {
        type: INTEGER,
      },
      type: {
        type: TINYINT,
      },
      mode: {
        type: INTEGER,
      },
      amount: {
        type: DOUBLE,
      },
      amount_signed: {
        type: DOUBLE,
      },
      payment_date_time: {
        type: DATE,
      },
      approve_date_time: {
        type: DATE,
      },
      remark: {
        type: STRING,
      },
      isDelete: {
        type: TINYINT,
      },
    },
    {
      tableName: "account_outstanding_view",
      timestamps: false,
    },
  );
};
