import { DATE, INTEGER, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const activationCodeMasterModel = sequelize.define("activation_code_masters", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  activation_code: {
    type: STRING,
  },
  mobile_number: {
    type: STRING,
  },
  date_of_activation: {
    type: DATE,
  },
  plan_id :{
    type:INTEGER
  },
  months: {
    type: INTEGER,
  },
  OTP: {
    type: INTEGER,
  },
  created_date: {
    type: DATE,
  },
  entry_flag:{
    type:TINYINT
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

export default activationCodeMasterModel;
