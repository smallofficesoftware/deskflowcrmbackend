import {
    DATE,
    ENUM,
    INTEGER,
    NOW,
    STRING,
    TEXT,
} from "sequelize";

export const miracleLogModel = (sequelize) => {
    return sequelize.define("miracle_logs", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        log_type: {
            type: ENUM("WEBHOOK", "CRM_API", "MIRACLE_OUTBOUND"),
            allowNull: false,
        },
        module_name: {
            type: STRING(100),
            defaultValue: "",
        },
        record_id: {
            type: INTEGER,
            defaultValue: null,
        },
        action_type: {
            type: STRING(20),
            defaultValue: "",
        },
        miracle_unique_id: {
            type: STRING(255),
            defaultValue: "",
        },
        url: {
            type: STRING(500),
            defaultValue: "",
        },
        method: {
            type: STRING(10),
            defaultValue: "POST",
        },
        status_code: {
            type: INTEGER,
            defaultValue: null,
        },
        status: {
            type: ENUM("SUCCESS", "FAILED", "SKIPPED"),
            defaultValue: "SUCCESS",
        },
        response_time: {
            type: INTEGER,
            defaultValue: null,
        },
        request_payload: {
            type: TEXT("long"),
            defaultValue: null,
        },
        response_payload: {
            type: TEXT("long"),
            defaultValue: null,
        },
        error_message: {
            type: TEXT,
            defaultValue: null,
        },
        company_masters_id: {
            type: INTEGER,
            defaultValue: null,
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
        createdAt: "created_date_time",
        updatedAt: "modified_date",
    });
};
