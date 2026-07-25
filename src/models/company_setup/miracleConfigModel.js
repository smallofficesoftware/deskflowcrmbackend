import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const miracleConfigModel = sequelize.define("miracle_configurations", {
    id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    company_id: {
        type: INTEGER,
    },
    Year: {
        type: STRING(255),
    },
    client_id: {
        type: TEXT,
    },
    api_key: {
        type: TEXT,
    },
    urlKey: {
        type: TEXT,
    },
    baseurl: {
        type: TEXT,
    },
    access_token: {
        type: TEXT,
    },
    auth_date_time: {
        type: DATE,
    },
    BranchName: {
        type: STRING(255),
    },
    CompanyName: {
        type: STRING(255),
    },
    s_timestemp: {
        type: DATE,
    },
    created_date_time: {
        type: DATE,
        defaultValue: NOW,
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

export default miracleConfigModel;