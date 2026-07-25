import {
    DATE,
    INTEGER,
    TINYINT
} from "sequelize";

export const printSettingModel = (sequelize) => {
    return sequelize.define("print_settings", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        type: {
            type: TINYINT,
        },
        print_version: {
            type: TINYINT,
        },
        setting_details: {
            type: String,
        },
        created_date_time: {
            type: DATE,
        },
        modify_date_time: {
            type: DATE,
        },
        modify_by: {
            type: INTEGER,
        },
        a_application_login_id: {
            type: INTEGER,
        },
        company_masters_id: {
            type: INTEGER,
        },
        isDelete: {
            type: TINYINT,
            defaultValue: "0",
        },

        isActive: {
            type: TINYINT,
            defaultValue: "1",
        },

        s_timestemp: {
            type: Date,
        },
    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });
};
