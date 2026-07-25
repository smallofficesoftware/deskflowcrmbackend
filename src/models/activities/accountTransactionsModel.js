import { DATE, DOUBLE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const accountTransactionsModel = (sequelize) => {
  return sequelize.define("account_transactions", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    contact_masters_id: {
      type: INTEGER,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    company_masters_id: {
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
    payment_date_time: {
      type: DATE,
    },
    remark: {
      type: STRING,
    },
    approve_by_a_application_login_id: {
      type: INTEGER,
    },
    approve_date_time: {
      type: DATE,
    },
    miracle_account_ledger: {
      type: TEXT,
    },
    miracle_UniqueId: {
      type: TEXT,
    },
    miracle_update_date_time: {
      type: DATE,
    },
    reference_id: {
      type: INTEGER,
    },
    reference_table: {
      type: STRING,
    },
    amount_type: {
      type: TINYINT,
    },
    created_date_time: {
      type: DATE,
      defaultValue: NOW,
    },

    s_timestemp: {
      type: STRING,
    },
    isDelete: {
      type: TINYINT,
      defaultValue: "0",
    },

    isActive: {
      type: TINYINT,
      defaultValue: "1",
    },
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });

}