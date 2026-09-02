import { DATE, ENUM, INTEGER, TINYINT } from "sequelize";

export const reportDefinitionTeamRightModel = (sequelize) => {
  return sequelize.define(
    "report_definition_team_rights",
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
      data_scope: {
        type: ENUM("own", "all", "chain"),
        defaultValue: "own",
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
