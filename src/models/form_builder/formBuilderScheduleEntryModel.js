import { DATE, DATEONLY, INTEGER } from "sequelize";

export const formBuilderScheduleEntryModel = (sequelize) => {
  return sequelize.define(
    "form_builder_schedule_entries",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER },
      schedule_id: { type: INTEGER },
      form_id: { type: INTEGER },
      due_date: { type: DATEONLY },
      a_application_login_id: { type: INTEGER },
      submission_id: { type: INTEGER },
      filled_at: { type: DATE },
    },
    { timestamps: false },
  );
};
