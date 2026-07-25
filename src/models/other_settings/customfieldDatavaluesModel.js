import { DATE, INTEGER, TEXT, TINYINT } from "sequelize";

export const customFieldDatavaluesModel = (sequelize) => {
    return sequelize.define("custom_field_form_datavalues", {
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
        custom_field_master_id: {
            type: INTEGER,
        },
        data_type: {
            type: INTEGER,
        },
        data_sorce: {
            type: TEXT,
        },
        created_date_time: {
            type: DATE,
        },
        isDelete: {
            type: TINYINT,
            defaultValue: "0",
        },
        isActive: {
            type: TINYINT,
            defaultValue: "1",
        },
    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });

}