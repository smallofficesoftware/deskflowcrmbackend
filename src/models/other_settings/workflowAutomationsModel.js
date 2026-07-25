import { DATE, INTEGER, NOW, TEXT, TINYINT } from "sequelize";

export const workflowAutomationsModel = (sequelize) => {

    return sequelize.define("wrkflw_google_sheet_configs", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        a_application_login_id: {
            type: INTEGER,
        },
        company_masters_id: {
            type: INTEGER,
        },
        type: {
            type: INTEGER,
        },
        raw_values: {
            type: TEXT,
        },
        isDelete: {
            type: TINYINT,
            defaultValue: "1",
        },
        isActive: {
            type: TINYINT,
            defaultValue: "1",
        },
        created_date_time: {
            type: DATE,
            defaultValue: NOW,
        },
    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });

}