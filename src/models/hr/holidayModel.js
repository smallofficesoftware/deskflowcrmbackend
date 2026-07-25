import { DATEONLY, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const holidayModel = (sequelize) => {
    return sequelize.define("holidays", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        holiday_date: {
            type: DATEONLY,
        },
        holiday_remark: {
            type: TEXT,
        },
        company_masters_id: {
            type: INTEGER,
        },
        a_application_login_id: {
            type: INTEGER,
        },
        s_timestemp: {
            type: STRING,
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