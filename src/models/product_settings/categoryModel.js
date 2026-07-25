import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const categoryModel = (sequelize) => {

  return sequelize.define("categories", {
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
    category_name: {
      type: TEXT,
    },
    created_date_time: {
      type: DATE,
      defaultValue: NOW,
    },
    s_timestemp: {
      type: STRING,
    },
    color: {
      type: STRING,
    },
    group_id: {
      type: INTEGER,
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