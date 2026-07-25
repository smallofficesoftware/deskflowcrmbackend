import { DATE, DATEONLY, INTEGER, JSON, NOW, STRING, TINYINT } from "sequelize";

export const AttendanceBatchProcess = (sequelize) => {
    return sequelize.define("attendance_batch_process", {
        id: {
            type: INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },

        date: {
            type: DATEONLY,
            allowNull: false,
        },

        employee_id: {
            type: INTEGER,
            allowNull: false,
        },

        company_masters_id: {
            type: INTEGER,
            allowNull: false,
        },

        a_application_login_id: {
            type: INTEGER,
            allowNull: false,
        },

        search_string: {
            type: STRING(255),
            allowNull: false,
        },

        last_updated_date: {
            type: DATE,
            allowNull: false,
        },

        day_status: {
            type: TINYINT,
            allowNull: false,
        },

        total_working_time: {
            type: STRING(100),
            allowNull: false,
        },
        net_working_hour: {
            type: STRING(100),
            allowNull: false,
        },
        overtime_hour: {
            type: STRING(100),
            allowNull: false,
        },
        is_sandwich_applied: {
            type: TINYINT,
            allowNull: false,
            defaultValue: 0,
        },
        early_out: {
            type: STRING(100),
            allowNull: true,
        },

        late_in: {
            type: STRING(100),
            allowNull: true,
        },

        first_in: {
            type: DATE,
            allowNull: true
        },

        last_out: {
            type: DATE,
            allowNull: true,
        },

        compensation_list: {
            type: JSON,
            allowNull: false,
        },

        attenance_entry_list: {
            type: JSON,
            allowNull: false,
        },

        leave_entry_list: {
            type: JSON,
            allowNull: false,
        },

        created_date_time: {
            type: DATE,
            allowNull: false,
        },

        s_timestemp: {
            type: DATE,
            allowNull: false,
            defaultValue: NOW,
        },

        isDelete: {
            type: TINYINT,
            allowNull: false,
            defaultValue: 0,
        },

        isActive: {
            type: TINYINT,
            allowNull: false,
            defaultValue: 1,
        },

        modified_date: {
            type: DATE,
            allowNull: false,
            defaultValue: NOW,
        },
    }, {
        tableName: 'attendance_batch_process',
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date',

        indexes: [
            {
                unique: true,
                fields: ['date', 'employee_id', 'isDelete'],
                name: 'date_2',
            },
            {
                fields: ['date'],
                name: 'date',
            },
            {
                fields: ['employee_id'],
                name: 'employee_id',
            },
            {
                fields: ['isDelete'],
                name: 'isDelete',
            },
        ],
    });

}