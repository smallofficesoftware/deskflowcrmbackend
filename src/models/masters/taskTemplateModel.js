import { DATE, INTEGER, NOW, STRING, TINYINT } from "sequelize";


export const taskTemplateModel = (sequelize) => {

    return sequelize.define("task_templete_masters", {

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

        name: {
            type: STRING,
        },

        color: {
            type: STRING,
        },

        templete_type: {
            type: INTEGER,
        },
        display_order_type: {
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

}