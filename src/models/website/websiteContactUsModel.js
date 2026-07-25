import { DATE, INTEGER, STRING, TIME, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const websiteContactUsModel = sequelize.define("website_contact_us_details", {
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
  company_name: {
    type: STRING,
  },
  country: {
    type: STRING,
  },
  contact_number: {
    type: STRING,
  },
  website: {
    type: STRING,
  },
  comments: {
    type: STRING,
  },
  agreeToTerms: {
    type: STRING,
  },
  business_category: {
    type: STRING,
  },
  city: {
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
export default websiteContactUsModel;
