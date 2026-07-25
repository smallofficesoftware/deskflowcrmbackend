import { DATE, DOUBLE, INTEGER, NOW, STRING, TINYINT } from "sequelize";

export const bomVsProcessListsModel = (sequelize) => {
    return sequelize.define("bom_vs_process_lists", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        bom_id: {
            type: INTEGER,
        },
        product_id: {
            type: INTEGER,
        },
        process_id: {
            type: INTEGER,
        },
        workstation_id: {
            type: INTEGER,
        },
        required_time: {
            type: STRING,
        },
        process_cost: {
            type: DOUBLE,
        },
        manpower_cost: {
            type: DOUBLE,
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
