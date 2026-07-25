import {
  DATE,
  DATEONLY,
  DOUBLE,
  INTEGER,
  NOW,
  STRING,
  TEXT,
  TIME,
  TINYINT,
} from "sequelize";

export const visitsModel = (sequelize) => {
  return sequelize.define("visits", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    visit_type_id: {
      type: INTEGER,
    },
    company_masters_id: {
      type: INTEGER,
    },
    a_application_login_id: {
      type: INTEGER,
    },

    remark: {
      type: TEXT,
    },
    visit_image: {
      type: TEXT,
    },

    reference_table: {
      type: TEXT,
    },
    reference_id: {
      type: INTEGER,
    },
    start_date: {
      type: DATE,
    },
    end_date: {
      type: DATE,
    },
    contact_id: {
      type: INTEGER,
    },
    person_name: {
      type: STRING,
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
    visit_column_number_1: {
      type: INTEGER,
    },
    visit_column_number_2: {
      type: INTEGER,
    },
    visit_column_number_3: {
      type: INTEGER,
    },
    visit_column_number_4: {
      type: INTEGER,
    },
    visit_column_number_5: {
      type: INTEGER,
    },
    visit_column_text_1: {
      type: STRING,
    },
    visit_column_text_2: {
      type: STRING,
    },
    visit_column_text_3: {
      type: STRING,
    },
    visit_column_text_4: {
      type: STRING,
    },
    visit_column_text_5: {
      type: STRING,
    },
    visit_column_text_area_1: {
      type: TEXT,
    },
    visit_column_text_area_2: {
      type: TEXT,
    },
    visit_column_text_area_3: {
      type: TEXT,
    },
    visit_column_text_area_4: {
      type: TEXT,
    },
    visit_column_text_area_5: {
      type: TEXT,
    },
    visit_column_date_1: {
      type: DATEONLY,
    },
    visit_column_date_2: {
      type: DATEONLY,
    },
    visit_column_date_3: {
      type: DATEONLY,
    },
    visit_column_date_4: {
      type: DATEONLY,
    },
    visit_column_date_5: {
      type: DATEONLY,
    },
    visit_column_date_and_time_1: {
      type: DATE,
    },
    visit_column_date_and_time_2: {
      type: DATE,
    },
    visit_column_date_and_time_3: {
      type: DATE,
    },
    visit_column_date_and_time_4: {
      type: DATE,
    },
    visit_column_date_and_time_5: {
      type: DATE,
    },
    visit_column_time_1: {
      type: TIME,
    },
    visit_column_time_2: {
      type: TIME,
    },
    visit_column_time_3: {
      type: TIME,
    },
    visit_column_time_4: {
      type: TIME,
    },
    visit_column_time_5: {
      type: TIME,
    },
    visit_column_switch_1: {
      type: TINYINT,
    },
    visit_column_switch_2: {
      type: TINYINT,
    },
    visit_column_switch_3: {
      type: TINYINT,
    },
    visit_column_switch_4: {
      type: TINYINT,
    },
    visit_column_switch_5: {
      type: TINYINT,
    },
    visit_column_decimal_1: {
      type: DOUBLE,
    },
    visit_column_decimal_2: {
      type: DOUBLE,
    },
    visit_column_decimal_3: {
      type: DOUBLE,
    },
    visit_column_decimal_4: {
      type: DOUBLE,
    },
    visit_column_decimal_5: {
      type: DOUBLE,
    },
    visit_column_dropdown_1: {
      type: STRING,
    },
    visit_column_dropdown_2: {
      type: STRING,
    },
    visit_column_dropdown_3: {
      type: STRING,
    },
    visit_column_dropdown_4: {
      type: STRING,
    },
    visit_column_dropdown_5: {
      type: STRING,
    },
    visit_column_radio_1: {
      type: STRING,
    },
    visit_column_radio_2: {
      type: STRING,
    },
    visit_column_radio_3: {
      type: STRING,
    },
    visit_column_radio_4: {
      type: STRING,
    },
    visit_column_radio_5: {
      type: STRING,
    },
    visit_column_attechments_1: {
      type: TEXT,
    },
    visit_column_attechments_2: {
      type: TEXT,
    },
    visit_column_attechments_3: {
      type: TEXT,
    },
    visit_column_attechments_4: {
      type: TEXT,
    },
    visit_column_attechments_5: {
      type: TEXT,
    },
    stop_address: {
      type: TEXT,
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
    stop_latitude: {
      type: STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    stop_longitude: {
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
