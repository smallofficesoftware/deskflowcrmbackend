import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

export const labelModel = (sequelize) => {
  return sequelize.define("lable_masters", {
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
    lable_name: {
      type: STRING,
    },
    created_date_time: {
      type: DATE,
    },
    s_timestemp: {
      type: STRING,
    },
    color: {
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
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });

}