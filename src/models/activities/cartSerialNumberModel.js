import {
    DATE,
    INTEGER,
    NOW,
    STRING,
    TINYINT
} from "sequelize";

export const cartSerialNumberModel = (sequelize) => {
    return sequelize.define("cart_vs_serial_numbers", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        serial_numbers: {
            type: STRING,
        },

        cart_id: {
            type: INTEGER,
        },
        cart_type: {
            type: TINYINT,
        },
        product_id: {
            type: INTEGER,
        },
        cart_item_id: {
            type: INTEGER,
        },
        sn_reference_type: {
            type: INTEGER,
        },
        sn_reference_cart_id: {
            type: String,
        },
        company_masters_id: {
            type: INTEGER,
        },
        a_application_login_id: {
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
        created_date_time: {
            type: DATE,
            defaultValue: NOW,
        },
        modified_date: {
            type: DATE,
            defaultValue: NOW,
        },
    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });
};
