import { DATE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";
export const reminderMessagesModel = (sequelize) => {

  return sequelize.define("reminder_messages", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    contact_masters_id: {
      type: INTEGER,
    },
    // contact_message_histories_id: {
    //   type: INTEGER,
    // },
    task_id: {
      type: INTEGER,
    },
    reference_id: {
      type: INTEGER,
    },
    reference_table: {
      type: STRING,
    },
    company_masters_id: {
      type: INTEGER,
    },
    reminder_data_time: {
      type: DATE,
    },
    completed_date_time: {
      type: DATE,
    },
    assigned_to: {
      type: INTEGER,
    },
    create_date_time: {
      type: STRING,
    },
    is_reminder_app_flag: {
      type: TINYINT,
      defaultValue: "0",
    },
    isDelete: {
      type: TINYINT,
      defaultValue: "0",
    },
    isActive: {
      type: TINYINT,
      defaultValue: "1",
    },
    status: {
      type: TINYINT,
      defaultValue: "0",
    },
    remark: {
      type: TEXT,
    },
    call_date: {
      type: DATE,
    },
    call_duration: {
      type: STRING,
    },
    call_type: {
      type: INTEGER,
    },
    assigned_to_name: {
      type: STRING
    }
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });
}
