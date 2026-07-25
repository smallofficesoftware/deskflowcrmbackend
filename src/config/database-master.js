import dotenv from 'dotenv';
import path from 'path';

const NODE_ENV = process.env.NODE_ENV || 'production';

dotenv.config({
  path: path.resolve(process.cwd(), `.env.${NODE_ENV}`)
});

export default {
  [NODE_ENV]: {
    username: process.env.TENANT_DB_USER_NAME,
    password: process.env.TENANT_DB_PASSWORD,
    database: process.env.TENANT_DB_DB_NAME,
    host: process.env.TENANT_DB_HOST_NAME,
    dialect: 'mysql',
    timezone: '+05:30',
    define: {
      timestamps: false
    },
    pool: {
      max: 200000,
      min: 0,
      acquire: 300000,
      idle: 100000
    },
    logging: true
  }
};
