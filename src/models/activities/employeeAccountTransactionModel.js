import { DATE, DOUBLE, INTEGER, NOW, STRING, TINYINT } from "sequelize";


export const employeeAccountTransactionsModel = (sequelize) => {
    return sequelize.define("employee_account_transactions", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        team_id: {
            type: INTEGER,
        },
        a_application_login_id: {
            type: INTEGER,
        },
        company_masters_id: {
            type: INTEGER,
        },
        type: {
            type: TINYINT,
        },
        mode: {
            type: INTEGER,
        },
        amount: {
            type: DOUBLE,
        },
        payment_date_time: {
            type: DATE,
        },
        reference_id: {
            type: INTEGER
        },
        reference_table: {
            type: STRING(255)
        },
        salary_month: {
            type: INTEGER
        },
        salary_year: {
            type: INTEGER
        },
        remark: {
            type: STRING,
        },
        approve_by_a_application_login_id: {
            type: INTEGER,
        },
        approve_date_time: {
            type: DATE,
        },
        created_date_time: {
            type: DATE,
            defaultValue: NOW,
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