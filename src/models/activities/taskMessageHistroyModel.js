import { DATE, INTEGER, NOW, SMALLINT, STRING, TEXT, TINYINT } from "sequelize";
export const taskMessageHistroyModel = (sequelize) => {

  return sequelize.define("task_message_histories", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    description: {
      type: STRING,
    },
    current_status: {
      type: INTEGER,
    },
    created_date_time: {
      type: DATE,
      defaultValue: NOW,
    },
    s_timestemp: {
      type: DATE,
    },
    company_masters_id: {
      type: INTEGER,
    },
    task_id: {
      type: INTEGER,
    },
    message_side: {
      type: SMALLINT,
    },
    message_type_id: {
      type: INTEGER,
    },
    media_url: {
      type: TEXT,
    },
    media_name: {
      type: STRING,
    },

    is_reminder: {
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
    deleted_by: {
      type: INTEGER | STRING,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    application_login_name: {
      type: STRING
    }
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });

}