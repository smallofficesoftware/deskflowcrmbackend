import { DATE, DOUBLE, INTEGER, NOW, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const planMasterModel = sequelize.define("plan_masters", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  plan_name: {
    type: STRING,
  },
  plan_amount: {
    type: DOUBLE,
  },
  monthly_plan_amount: {
    type: DOUBLE,
  },
  months: {
    type: INTEGER,
  },
  trail_days: {
    type: INTEGER,
  },
  created_date_time: {
    type: DATE,
    defaultValue: NOW,
  },
  isDelete: {
    type: TINYINT,
    defaultValue: "0",
  },
  actual_amount: {
    type: DOUBLE,
  },
  isActive: {
    type: TINYINT,
    defaultValue: "1",
  },
});

export default planMasterModel;
