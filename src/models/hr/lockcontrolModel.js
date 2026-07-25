import { INTEGER, STRING, TINYINT } from "sequelize";


export const lockcontrolModel = (sequelize) => {
    return sequelize.define("lock_controls", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        month: {
            type: INTEGER,
        },
        year: {
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