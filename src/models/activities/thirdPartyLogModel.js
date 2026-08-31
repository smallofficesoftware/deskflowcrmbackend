import {
    DATE,
    ENUM,
    INTEGER,
    NOW,
    STRING,
    TEXT,
} from "sequelize";

export const thirdPartyLogModel = (sequelize) => {
    return sequelize.define("third_party_logs", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        integration: {
            type: STRING(40),
            allowNull: false,
        },
        direction: {
            type: ENUM("INBOUND", "OUTBOUND"),
            allowNull: false,
        },
        module_name: {
            type: STRING(100),
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
            type: ENUM("SUCCESS", "FAILED"),
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
        a_application_login_id: {
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
