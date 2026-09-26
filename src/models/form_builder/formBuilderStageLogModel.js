import { DATE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const formBuilderStageLogModel = (sequelize) => {
  return sequelize.define(
    "form_builder_stage_log",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER },
      form_id: { type: INTEGER },
      submission_id: { type: INTEGER },
      stage_id: { type: STRING(20) },
      stage_name: { type: STRING(100) },
      action: { type: STRING(20) },
      comment: { type: TEXT },
      a_application_login_id: { type: INTEGER },
      created_date_time: { type: DATE },
      isDelete: { type: TINYINT, defaultValue: 0 },
    },
    { timestamps: false },
  );
};
