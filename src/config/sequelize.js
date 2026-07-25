// This is for Master Database Connection

import { Sequelize } from "sequelize";
import { TENANT_DB_DB_NAME, TENANT_DB_HOST_NAME, TENANT_DB_PASSWORD, TENANT_DB_USER_NAME } from "../utils/appConstants.js";

export const dbConfig = {
    HOST: TENANT_DB_HOST_NAME,
    USER: TENANT_DB_USER_NAME,
    PASSWORD: TENANT_DB_PASSWORD,
    DB: TENANT_DB_DB_NAME,
    dialect: "mysql",
    pool: {
        max: 200000,
        min: 0,
        acquire: 300000,
        idle: 100000,
    },

}

import { requestContext } from "./context.js";

export const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
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
        idle: dbConfig.pool.idle
    },
    logging: true,
    // logging: (msg) => logger.info(msg),
});

const modelsProxy = new Proxy(sequelize.models, {
    get(target, prop) {
        const store = requestContext.getStore();
        if (store && store.models && store.models[prop]) {
            return store.models[prop];
        }
        return target[prop];
    },
    set(target, prop, value) {
        const store = requestContext.getStore();
        if (store && store.models) {
            store.models[prop] = value;
            return true;
        }
        target[prop] = value;
        return true;
    }
});

Object.defineProperty(sequelize, "models", {
    get() {
        return modelsProxy;
    },
    configurable: true
});

export default sequelize;