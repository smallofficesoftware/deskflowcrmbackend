import { DATE, INTEGER, NOW, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const companyVsApplicationLoginModel = sequelize.define(
  "company_vs_application_logins",
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
    //1=>self,2=>join
    company_flag: {
      type: TINYINT,
    },
    isDelete: {
      type: TINYINT,
      defaultValue: "0",
    },
    isActive: {
      type: TINYINT,
      defaultValue: "1",
    },
    s_timestemp: {
      type: DATE,
    },
    created_date_time: {
      type: DATE,
      defaultValue: NOW,
    },
  }
);

export default companyVsApplicationLoginModel;
