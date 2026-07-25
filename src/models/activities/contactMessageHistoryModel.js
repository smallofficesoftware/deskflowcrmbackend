import { DATE, INTEGER, NOW, SMALLINT, STRING, TEXT, TINYINT } from "sequelize";
export const contactMessageHistory = (sequelize) => {

  return sequelize.define("contact_message_histories", {
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
    contact_masters_id: {
      type: INTEGER,
    },
    message_side: {
      type: SMALLINT,
    },
    lable: {
      type: STRING,
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
    //	1 => whatsapp
    entry_flag: {
      type: INTEGER,
    },
    is_reminder: {
      type: TINYINT,
    },
    msg_cart_id: {
      type: INTEGER
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
    unique_key: {
      type: STRING
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