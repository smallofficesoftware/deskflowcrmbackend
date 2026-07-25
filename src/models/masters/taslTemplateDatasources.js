import { DATE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const taskTemplateDatasource = (sequelize) => {
    return sequelize.define("task_templete_datasources", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        a_application_login_id: {
            type: INTEGER,
        },
        company_masters_id: {
            type: INTEGER,
        },
        display_order: {
            type: INTEGER,
        },
        notification_time_gap: {
            type: INTEGER,
        },
        notification_time: {
            type: STRING,
        },
        is_depend_on_previous_task: {
            type: TINYINT,
        },
        task_id: {
            type: INTEGER,
        },
        task_template_master_id: {
            type: INTEGER,
        },
        data_sorce: {
            type: TEXT,
        },
        created_date_time: {
            type: DATE,
        },
        isDelete: {
            type: TINYINT,
            defaultValue: "0",
        },
        isActive: {
            type: TINYINT,
            defaultValue: "1",
        },
    },
        {
            timestamps: true,
            createdAt: 'created_date_time',
            updatedAt: 'modified_date'
        }
    );

}