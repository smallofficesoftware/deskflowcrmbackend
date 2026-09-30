import { DATE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const formBuilderTemplateModel = (sequelize) => {
  return sequelize.define(
    "form_builder_templates",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER },
      title: { type: STRING(150) },
      description: { type: STRING(500) },
      schema_json: { type: TEXT("long") },
      settings_json: { type: TEXT("long") },
      created_by_a_application_login_id: { type: INTEGER },
      created_date_time: { type: DATE },
      isDelete: { type: TINYINT, defaultValue: 0 },
      isActive: { type: TINYINT, defaultValue: 1 },
    },
    { timestamps: false },
  );
};
