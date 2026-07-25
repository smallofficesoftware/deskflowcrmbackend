import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const productGroupModel = (sequelize) => {

    return sequelize.define("product_groups", {
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
        group_name: {
            type: TEXT,
        },
        created_date_time: {
            type: DATE,
            defaultValue: NOW,
        },
        s_timestemp: {
            type: STRING,
        },
        group_color: {
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