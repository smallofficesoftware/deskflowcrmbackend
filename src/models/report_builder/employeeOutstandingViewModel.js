import { DATE, DOUBLE, INTEGER, STRING, TINYINT } from "sequelize";

// Maps to `employee_outstanding_view` (see alter.txt) — same recipe as
// account_outstanding_view, over employee_account_transactions instead of
// account_transactions (employeeTransactionReportService.js's
// getEmployeeAccountOutstandingReport is the same credit/debit netting
// shape, dimensioned by team_id instead of contact_masters_id).
export const employeeOutstandingViewModel = (sequelize) => {
  return sequelize.define(
    "employee_outstanding_view",
    {
      id: {
        type: INTEGER,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      team_id: {
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
      tableName: "employee_outstanding_view",
      timestamps: false,
    },
  );
};
