import { INTEGER, TINYINT } from "sequelize";

export const taxModel = (sequelize) => {

    return sequelize.define("tax_masters", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: INTEGER,
        },
        value: {
            type: INTEGER,
        },
        a_application_login_id: {
            type: INTEGER,
        },
        company_masters_id: {
            type: INTEGER,
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

