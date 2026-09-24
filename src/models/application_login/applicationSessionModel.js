import { DATE, INTEGER, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const applicationSessionModel = sequelize.define("application_sessions", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  a_application_login_id: {
    type: INTEGER,
    allowNull: false,
  },
  company_masters_id: {
    type: INTEGER,
    allowNull: false,
  },
  platform: {
    type: STRING(20),
    allowNull: false,
  },
  jwt_jti: {
    type: STRING(100),
    allowNull: false,
  },
  issued_at: {
    type: DATE,
    allowNull: false,
  },
  expires_at: {
    type: DATE,
    allowNull: false,
  },
  isDelete: {
    type: TINYINT,
    defaultValue: 0,
  },
});

export default applicationSessionModel;
