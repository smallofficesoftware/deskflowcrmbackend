import { DATE, DOUBLE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const maintenanceModesModel = sequelize.define("maintenance_modes", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  is_maintenance: {
    type: INTEGER,
  },
  is_logout_strict: {
    type: INTEGER,
  },
  created_date_time: {
    type: DATE,
    defaultValue: NOW,
  },

  s_timestemp: {
    type: STRING,
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

export default maintenanceModesModel;
