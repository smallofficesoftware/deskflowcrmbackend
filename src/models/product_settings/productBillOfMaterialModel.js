import {
    DATE,
    DOUBLE,
    INTEGER,
    NOW,
    STRING,
    TEXT,
    TINYINT
} from "sequelize";

export const productBillOfMaterialModel = (sequelize) => {
    return sequelize.define(
        "product_bill_of_materials",
        {
            id: {
                type: INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            product_id: {
                type: INTEGER,
            },
            bom_number: {
                type: STRING,
            },
            bom_name: {
                type: STRING,
            },
            qty: {
                type: DOUBLE,
            },
            unit: {
                type: INTEGER,
            },
            bom_document: {
                type: STRING,
            },
            bom_drawing: {
                type: STRING,
            },
            bom_review_frequency: {
                type: TEXT,
            },
            extra_charges_1: {
                type: DOUBLE,
            },
            extra_charges_2: {
                type: DOUBLE,
            },
            sales_rate: {
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
        },
        {
            timestamps: true,
            createdAt: 'created_date_time',
            updatedAt: 'modified_date'
        }
    );
};