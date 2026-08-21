import { DATE, INTEGER, NOW, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const companyFeatureFlagModel = sequelize.define("company_feature_flags", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  company_masters_id: {
    type: INTEGER,
  },
  feature_key: {
    type: STRING,
  },
  is_enabled: {
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
  modify_by: {
    type: INTEGER,
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

export default companyFeatureFlagModel;
