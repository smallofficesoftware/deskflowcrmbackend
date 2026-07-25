import { DATE, DOUBLE, INTEGER, NOW, STRING, TEXT, TIME, TINYINT } from "sequelize";

export const expenseTypeModel = (sequelize) => {
  return sequelize.define("expense_type_masters", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_masters_id: {
      type: INTEGER,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    expense_name: {
      type: TEXT,
    },
    color: {
      type: STRING,
    },
    created_date_time: {
      type: DATE,
      defaultValue: NOW,
    },
    s_timestemp: {
      type: STRING,
    },

    expense_subtype: {
      type: TINYINT,
    },
    min_time: {
      type: TIME,
    },
    max_time: {
      type: TIME,
    },
    min_amount: {
      type: DOUBLE,
    },
    max_amount: {
      type: DOUBLE,
    },
    fix_amount: {
      type: DOUBLE,
    },
    amount_per_km: {
      type: DOUBLE,
    },
    compulsory_image: {
      type: TINYINT,
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
};
