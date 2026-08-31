import { DATE, INTEGER, NOW, STRING, TINYINT } from "sequelize";

export const taskChecklistItemModel = (sequelize) => {

  return sequelize.define("task_checklist_items", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    task_id: {
      type: INTEGER,
    },
    title: {
      type: STRING,
    },
    is_done: {
      type: TINYINT,
      defaultValue: "0",
    },
    position: {
      type: INTEGER,
    },
    company_masters_id: {
      type: INTEGER,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    completed_date: {
      type: DATE,
    },
    completed_by: {
      type: INTEGER,
    },
    created_date_time: {
      type: DATE,
      defaultValue: NOW,
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
