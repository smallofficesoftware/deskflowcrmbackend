import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

export const reportGroupModel = (sequelize) => {
  return sequelize.define(
    "report_groups",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      group_name: {
        type: STRING,
      },
      display_order: {
        type: INTEGER,
        defaultValue: 0,
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
