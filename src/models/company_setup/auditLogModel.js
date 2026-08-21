import {
    DATE,
    INTEGER,
    NOW,
    STRING,
    TEXT
} from "sequelize";

export const auditLogModel = (sequelize) => {
    return sequelize.define("audit_logs", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        company_masters_id: {
            type: INTEGER,
        },
        a_application_login_id: {
            type: INTEGER,
        },
        module_key: {
            type: STRING,
        },
        action: {
            type: STRING,
        },
        entity_type: {
            type: STRING,
        },
        entity_id: {
            type: INTEGER,
        },
        details: {
            type: TEXT,
        },
        created_date_time: {
            type: DATE,
            defaultValue: NOW,
        },
    }, {
        timestamps: false,
    });
};
