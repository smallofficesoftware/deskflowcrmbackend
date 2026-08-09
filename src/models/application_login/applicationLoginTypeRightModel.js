import {
  DATE,
  INTEGER,
  JSON,
  STRING,
  TINYINT
} from "sequelize";

export const applicationLoginTypeRightModel = (sequelize) => {
  return sequelize.define("a_application_login_type_rights", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    a_application_login_id: {
      type: INTEGER,
      unique: true,
    },
    company_masters_id: {
      type: INTEGER,
      unique: true,
    },
    page_id: {
      type: INTEGER,
      unique: true,
    },
    page_name: {
      type: STRING,
    },
    a_page_id_rights_jason: {
      type: JSON,
    },
    created_date_time: {
      type: DATE,
    },
    isDelete: {
      type: TINYINT,
      defaultValue: "0",
    },

    isActive: {
      type: TINYINT,
      defaultValue: "1",
    },
  });
};
