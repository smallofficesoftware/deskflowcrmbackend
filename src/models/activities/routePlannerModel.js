import { DATEONLY, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const routePlannerModel = (sequelize) => {
    return sequelize.define("route_planners", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        employee_id: {
            type: INTEGER,
        },
        start_date: {
            type: DATEONLY,
        },
        end_date: {
            type: DATEONLY,
        },
        country_id: {
            type: INTEGER,
        },
        state_id: {
            type: INTEGER,
        },
        city_id: {
            type: INTEGER,
        },
        area_id: {
            type: INTEGER,
        },
        status_id: {
            type: INTEGER,
        },
        remark: {
            type: TEXT,
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