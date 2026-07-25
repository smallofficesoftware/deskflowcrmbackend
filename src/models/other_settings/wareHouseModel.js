import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const wareHouseModel = (sequelize) => {

    return sequelize.define("warehouses", {
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
        warehouse_name: {
            type: TEXT,
        },
        assigned_team_member: {
            type: TEXT,
        },
        created_date_time: {
            type: DATE,
            defaultValue: NOW,
        },
        s_timestemp: {
            type: STRING,
        },
        warehouse_color: {
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