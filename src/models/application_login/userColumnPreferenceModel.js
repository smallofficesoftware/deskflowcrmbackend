import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const userColumnPreferenceModel = (sequelize) => {
  return sequelize.define("user_column_preferences", {
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
    report_key: {
      type: STRING,
    },
    column_order: {
      type: TEXT,
    },
    hidden_columns: {
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
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });

}
