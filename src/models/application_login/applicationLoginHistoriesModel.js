import { DATE, INTEGER, STRING, TIME, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const applicationLoginHistoriesModel = sequelize.define("a_application_login_histories", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  a_application_login_id: {
    type: STRING,
  },
  login_date_time: {
    type: DATE,
  },
  logout_date_time: {
    type: DATE,
  },
  session_time :{
    type:TIME
  },
  ipaddress: {
    type: STRING,
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

export default applicationLoginHistoriesModel;
