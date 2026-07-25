import { DATE, INTEGER, STRING, TIME, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const websiteBookDemoModel = sequelize.define("website_book_demo_details", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: STRING,
  },
  email: {
    type: STRING,
  },
  business_category: {
    type: STRING,
  },
  contact_number: {
    type: STRING,
  },
  book_date: {
    type: DATE,
  },
  book_time: {
    type: TIME,
  },
  comments: {
    type: STRING,
  },
  agreeToTerms: {
    type: STRING,
  },
  created_date_time: {
    type: DATE,
  },
  s_timestemp: {
    type: TIME,
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
export default websiteBookDemoModel;
