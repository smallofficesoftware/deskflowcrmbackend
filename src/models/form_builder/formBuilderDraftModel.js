import { DATE, INTEGER, TEXT, TINYINT } from "sequelize";

export const formBuilderDraftModel = (sequelize) => {
  return sequelize.define(
    "form_builder_drafts",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER },
      form_id: { type: INTEGER },
      a_application_login_id: { type: INTEGER },
      answers_json: { type: TEXT("long") },
      created_date_time: { type: DATE },
      updated_date_time: { type: DATE },
      isDelete: { type: TINYINT, defaultValue: 0 },
    },
    { timestamps: false },
  );
};
