import { DATE, ENUM, INTEGER, TINYINT } from "sequelize";

export const formBuilderFormTeamRightModel = (sequelize) => {
  return sequelize.define(
    "form_builder_form_team_rights",
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
      a_application_login_id: {
        type: INTEGER,
      },
      can_fill: {
        type: TINYINT,
        defaultValue: 1,
      },
      submissions_scope: {
        type: ENUM("none", "own", "all"),
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
