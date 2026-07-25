import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const taskCategoryModel = (sequelize) => {
  return sequelize.define("task_categories", {
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
    task_category_name: {
      type: TEXT,
    },
    created_date_time: {
      type: DATE,
      defaultValue: NOW,
    },
    s_timestemp: {
      type: STRING,
    },
    task_color: {
      type: STRING,
    },
    visibility: {
      type: TINYINT,
    },
    is_assigned_widget: {
      type: TEXT
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
