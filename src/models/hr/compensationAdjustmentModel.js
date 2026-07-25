import { DATEONLY, DOUBLE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const compensationAdjustmentModel = (sequelize) => {
    return sequelize.define("compensation_adjustments", {
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
        employee_id: {
            type: INTEGER,
        },
        type_id: {
            type: INTEGER,
        },
        adjustment_type: {
            type: INTEGER,
        },
        amount: {
            type: DOUBLE,
        },
        hours: {
            type: DOUBLE,
        },
        apply_date: {
            type: DATEONLY,
        },
        remark: {
            type: TEXT,
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