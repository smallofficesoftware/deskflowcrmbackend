import { DATE, INTEGER, STRING, } from "sequelize";
import sequelize from "../config/sequelize.js";
export const socketConnectionsModel = () => {
  return sequelize.define(
    "socket_connections",
    {
      id: {
        type: INTEGER(11),
        autoIncrement: true,
        primaryKey: true,
        comment: "Primary key: Unique identifier for each socket connection",
      },
      a_application_logins_id: {
        type: INTEGER(11),
        allowNull: false,
        comment: "Foreign key: References 'a_application_logins' table, linking this socket to a specific user login user",
      },
      company_masters_id: {
        type: INTEGER(11),
        allowNull: false,
        comment: "Foreign key: References 'company_masters' table, indicating which company this socket belongs to",
      },
      socket_id: {
        type: STRING(255),
        allowNull: false,
        comment: "Unique socket identifier for the user's active WebSocket connection",
      },
      updated_date: {
        type: DATE,
        allowNull: false,
        comment: "Date and time when this socket connection record was last updated",
      },
    },
    {
      tableName: "socket_connections",
      timestamps: false,
      comment: "Stores active socket connection mappings for application logins across companies",
    }
  );
};
