import {
    DATE,
    ENUM,
    INTEGER,
    NOW,
    STRING,
    TEXT,
    TINYINT
} from "sequelize";

export const apiLogsModel = (sequelize) => {
    return sequelize.define("api_logs", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        type: {
            type: TINYINT,
        },
        company_masters_id: {
            type: INTEGER,
        },
        a_application_login_id: {
            type: INTEGER,
        },
        method: {
            type: STRING(10),
        },
        url: {
            type: STRING(255),
        },
        status_code: {
            type: INTEGER,
        },
        response_time: {
            type: INTEGER,
        },
        ip_address: {
            type: STRING(45),
        },
        user_agent: {
            type: TEXT,
        },
        level: {
            type: ENUM('info', 'error'),
            defaultValue: 'info',
        },
        error: {
            type: TEXT,
        },
        requestBody: {
            type: TEXT,
        },
        isDelete: {
            type: TINYINT,
        },
        isActive: {
            type: TINYINT,
        },
        created_date_time: {
            type: DATE,
            defaultValue: NOW,
        },
        modified_date: {
            type: DATE,
            defaultValue: NOW,
        },

    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });
};
