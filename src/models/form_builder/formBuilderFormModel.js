import { DATE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const formBuilderFormModel = (sequelize) => {
  return sequelize.define(
    "form_builder_forms",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      a_application_login_id: {
        type: INTEGER,
      },
      title: {
        type: STRING,
      },
      description: {
        type: TEXT,
      },
      schema_json: {
        type: TEXT("long"),
      },
      published_schema_json: {
        type: TEXT("long"),
      },
      has_unpublished_changes: {
        type: TINYINT,
        defaultValue: 0,
      },
      version: {
        type: INTEGER,
        defaultValue: 1,
      },
      related_module: {
        type: STRING(50),
      },
      allow_public_submission: {
        type: TINYINT,
        defaultValue: 0,
      },
      share_token: {
        type: STRING(64),
      },
      submission_table_name: {
        type: STRING(100),
      },
      restrict_to_assigned_team: {
        type: TINYINT,
        defaultValue: 0,
      },
      display_order: {
        type: INTEGER,
        defaultValue: 0,
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
      timestamps: true,
      createdAt: "created_date_time",
      updatedAt: "modified_date",
    },
  );
};
