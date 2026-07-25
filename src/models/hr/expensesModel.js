import { DATE, DOUBLE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const expensesModel = (sequelize) => {
  return sequelize.define("expenses", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    expense_type_id: {
      type: INTEGER,
    },
    company_masters_id: {
      type: INTEGER,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    amount: {
      type: DOUBLE,
    },
    remark: {
      type: TEXT,
    },

    pass_amount: {
      type: DOUBLE,
    },
    kilometers: {
      type: DOUBLE,
    },
    expense_date: {
      type: DATE,
    },
    status_remark: {
      type: TEXT,
    },
    created_by: {
      type: INTEGER,
    },
    expense_status: {
      type: TINYINT,
      defaultValue: "1",
    },
    image: {
      type: TEXT,
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
    address: {
      type: TEXT,
    },

    longitude: {
      type: STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    latitude: {
      type: STRING(255),
      allowNull: true,
      defaultValue: null,
    },
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });
};
