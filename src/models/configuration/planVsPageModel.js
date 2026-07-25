import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const planVsPageModel = sequelize.define("plan_vs_pages", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  plan_id: {
    type: STRING,
  },
  page_id: {
    type: INTEGER,
  },
  data_limit: {
    type: INTEGER
  },
  extra_information: {
    type: TEXT
  },
  created_date_time: {
    type: DATE,
    defaultValue: NOW
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

export default planVsPageModel;
