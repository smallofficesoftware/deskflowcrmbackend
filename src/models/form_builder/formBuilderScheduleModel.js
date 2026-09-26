import { DATE, DATEONLY, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const formBuilderScheduleModel = (sequelize) => {
  return sequelize.define(
    "form_builder_schedules",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER },
      form_id: { type: INTEGER },
      title: { type: STRING(150) },
      frequency: { type: STRING(10) },
      weekdays: { type: STRING(20) },
      day_of_month: { type: TINYINT },
      assignee_login_ids: { type: TEXT },
      start_date: { type: DATEONLY },
      end_date: { type: DATEONLY },
      last_generated_date: { type: DATEONLY },
      created_by_a_application_login_id: { type: INTEGER },
      created_date_time: { type: DATE },
      isDelete: { type: TINYINT, defaultValue: 0 },
      isActive: { type: TINYINT, defaultValue: 1 },
    },
    { timestamps: false },
  );
};
