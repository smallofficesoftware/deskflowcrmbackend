import { DATE, INTEGER, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const tenantMasterModel = sequelize.define("tenant_masters", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  a_application_login_id: {
    type: INTEGER,
    unique: true,
  },
  company_masters_id: {
    type: INTEGER,
    unique: true,
  },
  application_login_name: {
    type: STRING,
  },
  db_host: {
    type: STRING,
  },
  db_user: {
    type: STRING,
  },
  db_user: {
    type: STRING,
  },
  db_password: {
    type: DATE,
  },
  db_name: {
    type: STRING,
  },
  created_date_time: {
    type: DATE,
  },
  version_update_date_time: {
    type: DATE,
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

export default tenantMasterModel; // Import your tenant master model
