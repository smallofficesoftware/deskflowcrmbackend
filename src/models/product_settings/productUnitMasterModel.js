import {
    DATE,
    INTEGER,
    NOW,
    STRING,
    TEXT,
    TINYINT
} from "sequelize";
export const productUnitMasterModel = (sequelize) => {
    return sequelize.define(
        "product_unit_masters",
        {
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
            unit: {
                type: TEXT,
            },
            is_point_value_allow: {
                type: TINYINT,
                defaultValue: "0",
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

        },
        {
            timestamps: true,
            createdAt: 'created_date_time',
            updatedAt: 'modified_date'

        }
    );
};
