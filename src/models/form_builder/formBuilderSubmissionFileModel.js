import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

export const formBuilderSubmissionFileModel = (sequelize) => {
  return sequelize.define(
    "form_builder_submission_files",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      form_id: {
        type: INTEGER,
      },
      submission_id: {
        type: INTEGER,
      },
      field_key: {
        type: STRING(255),
      },
      file_type: {
        type: STRING(20),
      },
      original_file_name: {
        type: STRING(255),
      },
      stored_file_name: {
        type: STRING(255),
      },
      file_path: {
        type: STRING(500),
      },
      mime_type: {
        type: STRING(100),
      },
      file_size: {
        type: INTEGER,
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
