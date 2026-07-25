import { INTEGER, STRING, TINYINT } from "sequelize";

export const routePlanVsContactsModel = (sequelize) => {
    return sequelize.define("route_plan_vs_contacts", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        route_id: {
            type: INTEGER,
        },
        contact_id: {
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