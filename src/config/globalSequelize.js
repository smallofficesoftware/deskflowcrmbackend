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
    max: Number(process.env.GLOBAL_POOL_MAX) || 40, // tenant_masters lookups etc.
    min: 0,
    acquire: Number(process.env.MASTER_POOL_ACQUIRE_MS) || 30000, // fail fast instead of waiting 5 min
    idle: 10000, // Connection idle timeout
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
    // SQL logging off by default (huge logs); set SQL_LOGGING=1 to debug
    logging: process.env.SQL_LOGGING === "1" ? console.log : false,
  }
);
