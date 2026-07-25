// This is only for get Tenant Database Credentials

import { Sequelize } from "sequelize";
import { TENANT_DB_DB_NAME, TENANT_DB_HOST_NAME, TENANT_DB_PASSWORD, TENANT_DB_USER_NAME } from "../utils/appConstants.js";

export const dbConfig = {
  HOST: TENANT_DB_HOST_NAME,
  USER: TENANT_DB_USER_NAME,
  PASSWORD: TENANT_DB_PASSWORD,
  DB: TENANT_DB_DB_NAME,
  dialect: "mysql",
  pool: {
    max: 200000, // Increase max connections
    min: 0,
    acquire: 300000, // Increase acquire timeout (default: 10000ms)
    idle: 100000, // Connection idle timeout
  }
};

export const globalSequelize = new Sequelize(
  dbConfig.DB,
  dbConfig.USER,
  dbConfig.PASSWORD,
  {
    host: dbConfig.HOST,
    dialect: dbConfig.dialect,
    timezone: "+05:30",
    define: {
      timestamps: false,
    },
    pool: {
      max: dbConfig.pool.max,
      min: dbConfig.pool.min,
      acquire: dbConfig.pool.acquire,
      idle: dbConfig.pool.idle,
    },
    logging: true,
    // logging: (msg) => logger.info(msg),
  }
);
