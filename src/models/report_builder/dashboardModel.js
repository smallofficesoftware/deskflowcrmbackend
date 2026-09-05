import { INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const dashboardModel = (sequelize) => {
  return sequelize.define(
    "dashboards",
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
      description: {
        type: TEXT,
      },
      // Named icon key (frontend's reportIcons.tsx) — same convention as
      // report_definitions.icon. NULL falls back to a default icon.
      icon: {
        type: STRING,
      },
      is_default: {
        type: TINYINT,
        defaultValue: "0",
      },
      display_order: {
        type: INTEGER,
        defaultValue: 0,
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
