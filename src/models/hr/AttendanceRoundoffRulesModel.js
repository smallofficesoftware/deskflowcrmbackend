import { DATE, INTEGER, NOW, TINYINT } from "sequelize";

export const AttendanceRoundoffRules = (sequelize) => {
    return sequelize.define("attendance_roundoff_rules", {
        id: {
            type: INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
        },
        minutes: {
            type: INTEGER(11),
            allowNull: false,
        },
        conversion_minutes: {
            type: INTEGER(11),
            allowNull: false,
        },
        company_masters_id: {
            type: INTEGER(11),
            allowNull: false,
        },
        a_application_login_id: {
            type: INTEGER(11),
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

    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });

}