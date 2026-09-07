import { ENUM, INTEGER, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

// Master DB, read-only from this repo (listSystemDashboardDefinitions/
// copyFromSystemDashboardDefinition) — full CRUD lives in adminpanel's own
// backend, same precedent systemReportDefinitionModel.js already has.
const systemDashboardDefinitionModel = sequelize.define("system_dashboard_definitions", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: STRING,
  },
  description: {
    type: TEXT,
  },
  category: {
    type: STRING,
  },
  priority: {
    type: ENUM("critical", "high", "normal"),
  },
  icon: {
    type: STRING,
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

export default systemDashboardDefinitionModel;
