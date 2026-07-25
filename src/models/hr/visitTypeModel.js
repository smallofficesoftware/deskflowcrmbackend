import { DATE, INTEGER, NOW, STRING, TINYINT } from "sequelize";

export const visitTypeModel = (sequelize) => {
  return sequelize.define("visit_type_masters", {
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
    visit_type: {
      type: INTEGER,
    },
    color: {
      type: STRING,
    },
    created_date_time: {
      type: DATE,
      defaultValue: NOW,
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
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });
};
