
import {
  DATE,
  INTEGER,
  STRING,
  TEXT,
  TIME,
  TINYINT
} from "sequelize";

export const attendanceModel = (sequelize) => {
  return sequelize.define("attendance_histories", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    attendance_status: {
      type: TINYINT,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    check_in_out_date_time: {
      type: DATE,
    },
    total_working_hour: {
      type: TIME,
    },
    created_date_time: {
      type: DATE,
    },
    s_timestemp: {
      type: DATE,
    },
    isDelete: {
      type: TINYINT,
      defaultValue: "0",
    },
    attendance_entry_flag: {
      type: TINYINT,
      defaultValue: 1,
      comment: "1=>punch-in 2=>auto 3=>manual",
    },
    image_url: {
      type: STRING,
      allowNull: false,
    },
    remark: {
      type: STRING,
    },
    address: {
      type: TEXT,
    },
    latitude: {
      type: STRING(100),
    },
    longitude: {
      type: STRING(100),
    },
    updated_by: {
      type: INTEGER,
    },
    isActive: {
      type: TINYINT,
      defaultValue: "1",
    },
    company_masters_id: {
      type: INTEGER,
    },
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });
};