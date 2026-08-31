import { INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const reportDefinitionModel = (sequelize) => {
  return sequelize.define(
    "report_definitions",
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
      name: {
        type: STRING,
      },
      type: {
        type: STRING,
        defaultValue: "query",
      },
      page_id: {
        type: INTEGER,
      },
      model_key: {
        type: STRING,
      },
      plugin_key: {
        type: STRING,
      },
      columns_json: {
        type: TEXT,
      },
      filters_json: {
        type: TEXT,
      },
      group_by_json: {
        type: TEXT,
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
    },
    {
      timestamps: true,
      createdAt: "created_date_time",
      updatedAt: "modified_date",
    },
  );
};
