import {
  DATE,
  DATEONLY,
  DOUBLE,
  INTEGER,
  STRING,
  TEXT,
  TIME,
  TINYINT,
} from "sequelize";
// import contact from "./contactModel.js";
export const inquiryModel = (sequelize) => {
  return sequelize.define("inquiries", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    contact_master_id: {
      type: INTEGER,
    },
    // product_name: {
    //   type: TEXT,
    // },
    // category_name: {
    //   type: TEXT,
    // },
    description: {
      type: TEXT,
    },
    inquiry_assigned_team_member: {
      type: TEXT
    },
    qty: {
      type: INTEGER,
    },
    category_id: {
      type: INTEGER,
    },
    product_id: {
      type: INTEGER,
    },
    source_type_id: {
      type: INTEGER,
    },
    label_id: {
      type: INTEGER,
    },
    contact_status: {
      type: INTEGER,
      defaultValue: "-2",
    },
    inquiry_date_time: {
      type: DATE,
    },
    create_date_time: {
      type: STRING,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    company_masters_id: {
      type: INTEGER,
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
    static: {
      type: TINYINT,
    },
    unique_key: {
      type: STRING
    },
    uniqe_india_mart_id: {
      type: STRING,
    },
    uniqe_trade_india_id: {
      type: STRING,
    },
    column_number_1: {
      type: INTEGER,
    },
    column_text_1: {
      type: STRING,
    },
    column_text_area_1: {
      type: TEXT,
    },
    column_date_1: {
      type: DATEONLY,
    },
    column_date_and_time_1: {
      type: DATE,
    },
    column_time_1: {
      type: TIME,
    },
    column_switch_1: {
      type: TINYINT,
    },
    column_decimal_1: {
      type: DOUBLE,
    },
    column_number_2: {
      type: INTEGER,
    },
    column_text_2: {
      type: STRING,
    },
    column_text_area_2: {
      type: TEXT,
    },
    column_date_2: {
      type: DATEONLY,
    },
    column_date_and_time_2: {
      type: DATE,
    },
    column_time_2: {
      type: TIME,
    },
    column_switch_2: {
      type: TINYINT,
    },
    column_decimal_2: {
      type: DOUBLE,
    },
    column_number_3: {
      type: INTEGER,
    },
    column_text_3: {
      type: STRING,
    },
    column_text_area_3: {
      type: TEXT,
    },
    column_date_3: {
      type: DATEONLY,
    },
    column_date_and_time_3: {
      type: DATE,
    },
    column_time_3: {
      type: TIME,
    },
    column_switch_3: {
      type: TINYINT,
    },
    column_decimal_3: {
      type: DOUBLE,
    },
    column_number_4: {
      type: INTEGER,
    },
    column_text_4: {
      type: STRING,
    },
    column_text_area_4: {
      type: TEXT,
    },
    column_date_4: {
      type: DATEONLY,
    },
    column_date_and_time_4: {
      type: DATE,
    },
    column_time_4: {
      type: TIME,
    },
    column_switch_4: {
      type: TINYINT,
    },
    column_decimal_4: {
      type: DOUBLE,
    },
    column_number_5: {
      type: INTEGER,
    },
    column_text_5: {
      type: STRING,
    },
    column_text_area_5: {
      type: TEXT,
    },
    column_date_5: {
      type: DATEONLY,
    },
    column_date_and_time_5: {
      type: DATE,
    },
    column_time_5: {
      type: TIME,
    },
    column_switch_5: {
      type: TINYINT,
    },
    column_decimal_5: {
      type: DOUBLE,
    },
    column_dropdown_1: {
      type: STRING,
    },
    column_dropdown_2: {
      type: STRING,
    },
    column_dropdown_3: {
      type: STRING,
    },
    column_dropdown_4: {
      type: STRING,
    },
    column_dropdown_5: {
      type: STRING,
    },
    column_radio_1: {
      type: STRING,
    },
    column_radio_2: {
      type: STRING,
    },
    column_radio_3: {
      type: STRING,
    },
    column_radio_4: {
      type: STRING,
    },
    column_radio_5: {
      type: STRING,
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
