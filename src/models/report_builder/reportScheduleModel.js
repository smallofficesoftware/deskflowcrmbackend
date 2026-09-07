import { DATE, ENUM, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const reportScheduleModel = (sequelize) => {
  return sequelize.define(
    "report_schedules",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      report_definition_id: {
        type: INTEGER,
      },
      a_application_login_id: {
        type: INTEGER,
      },
      frequency: {
        type: ENUM("daily", "weekly", "monthly"),
      },
      send_time: {
        type: STRING,
      },
      day_of_week: {
        type: TINYINT,
      },
      day_of_month: {
        type: TINYINT,
      },
      delivery_format: {
        type: ENUM("excel", "pdf", "both"),
        defaultValue: "excel",
      },
      recipients: {
        type: TEXT,
      },
      next_run_at: {
        type: DATE,
      },
      last_run_at: {
        type: DATE,
      },
      created_date_time: {
        type: DATE,
      },
      isDelete: {
        type: TINYINT,
        defaultValue: 0,
      },
      isActive: {
        type: TINYINT,
        defaultValue: 1,
      },
    },
    {
      timestamps: false,
    },
  );
};
