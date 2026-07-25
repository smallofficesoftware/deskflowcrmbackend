import { DATEONLY, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const dayConversionModel = (sequelize) => {
    return sequelize.define("day_conversions", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        description: {
            type: TEXT,
        },
        date: {
            type: DATEONLY,
        },
        adjustment_date: {
            type: DATEONLY,
        },
        type_of_holiday: {
            type: TINYINT,
        },
        employee_id: {
            type: INTEGER,
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