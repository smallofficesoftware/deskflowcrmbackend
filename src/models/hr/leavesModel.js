import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const leavesModel = (sequelize) => {
    return sequelize.define("leaves", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        leave_type_id: {
            type: INTEGER,
        },
        leave_date: {
            type: DATE,
        },
        reporting_date: {
            type: DATE,
        },
        leave_duration: {
            type: INTEGER,
        },
        remark: {
            type: TEXT,
        },
        status_remark: {
            type: TEXT,
        },
        attachment: {
            type: TEXT,
        },
        leave_status: {
            type: TINYINT,
            defaultValue: "1",
        },
        hourly_leave_duration: {
            type: STRING,
        },
        created_by: {
            type: INTEGER,
        },
        company_masters_id: {
            type: INTEGER,
        },
        a_application_login_id: {
            type: INTEGER,
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
};
