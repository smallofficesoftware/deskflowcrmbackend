import { INTEGER, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

// Master DB, read-only from this repo — see systemDashboardDefinitionModel.js.
const systemDashboardWidgetModel = sequelize.define("system_dashboard_widgets", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  system_dashboard_definition_id: {
    type: INTEGER,
  },
  widget_type: {
    type: STRING,
  },
  title: {
    type: STRING,
  },
  model_key: {
    type: STRING,
  },
  label_column: {
    type: STRING,
  },
  value_column: {
    type: STRING,
  },
  aggregate: {
    type: STRING,
  },
  position_x: {
    type: INTEGER,
    defaultValue: 0,
  },
  position_y: {
    type: INTEGER,
    defaultValue: 0,
  },
  width: {
    type: INTEGER,
    defaultValue: 4,
  },
  height: {
    type: INTEGER,
    defaultValue: 3,
  },
  display_order: {
    type: INTEGER,
    defaultValue: 0,
  },
  isDelete: {
    type: TINYINT,
    defaultValue: 0,
  },
}, {
  timestamps: false,
});

export default systemDashboardWidgetModel;
