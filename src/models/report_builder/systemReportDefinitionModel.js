import { ENUM, INTEGER, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const systemReportDefinitionModel = sequelize.define("system_report_definitions", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: STRING,
  },
  type: {
    type: STRING,
    defaultValue: "query",
  },
  model_key: {
    type: STRING,
  },
  plugin_key: {
    type: STRING,
  },
  columns_json: {
    type: TEXT,
  },
  filters_json: {
    type: TEXT,
  },
  group_by_json: {
    type: TEXT,
  },
  filters_to_show: {
    type: TEXT,
  },
  category: {
    type: STRING,
  },
  description: {
    type: TEXT,
  },
  priority: {
    type: ENUM("critical", "high", "normal"),
  },
  display_order: {
    type: INTEGER,
    defaultValue: 0,
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

export default systemReportDefinitionModel;
