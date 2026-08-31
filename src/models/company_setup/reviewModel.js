import { DATE, ENUM, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const reviewModel = sequelize.define("reviews", {
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
  rating: {
    type: TINYINT,
  },
  review_type: {
    type: ENUM("system", "playstore", "appstore"),
  },
  comment: {
    type: TEXT,
  },
  platform: {
    type: ENUM("web", "android", "ios"),
  },
  device_id: {
    type: STRING,
  },
  ip_address: {
    type: STRING,
  },
  is_completed: {
    type: TINYINT,
    defaultValue: 0,
  },
  rating_given_date: {
    type: DATE,
  },
  last_asked_date: {
    type: DATE,
  },
  store_prompt_last_asked_date: {
    type: DATE,
  },
  store_review_completed: {
    type: TINYINT,
    defaultValue: 0,
  },
  created_date_time: {
    type: DATE,
    defaultValue: NOW,
  },
  modified_date: {
    type: DATE,
  },
  isDelete: {
    type: TINYINT,
    defaultValue: 0,
  },
  isActive: {
    type: TINYINT,
    defaultValue: 1,
  },
}, {
  timestamps: false,
});

export default reviewModel;
