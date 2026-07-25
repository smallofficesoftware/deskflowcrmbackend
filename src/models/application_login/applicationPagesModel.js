import { DATE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const applicationPagesModel = sequelize.define("a_application_pages", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  page_name: {
    type: STRING,
  },
  modual_name: {
    type: STRING,
  },
  page_slug: {
    type: TEXT,
  },
  description: {
    type: STRING,
  },
  type: {
    type: INTEGER
  },
  created_date_time: {
    type: DATE,
  },
  isDelete: {
    type: TINYINT,
    defaultValue: "0",
  },
  isRights: {
    type: TINYINT,
    defaultValue: "1",
  },
  isPublic: {
    type: TINYINT,
    defaultValue: "1",
  },

  isActive: {
    type: TINYINT,
    defaultValue: "1",
  },
});

export default applicationPagesModel;
