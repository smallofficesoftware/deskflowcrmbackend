import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

export const cartvsattachmentmodel = (sequelize) => {

    return sequelize.define("cart_vs_attachments", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        cart_id: {
            type: INTEGER
        },
        display_order: {
            type: INTEGER
        },
        attachment: {
            type: STRING
        },
        a_application_login_id: {
            type: INTEGER,
        },
        company_master_id: {
            type: INTEGER,
        },
        created_date_time: {
            type: DATE,
        },
        s_timestemp: {
            type: DATE
        },
        isActive: {
            type: TINYINT,
            defaultValue: "1",
        },
        isDelete: {
            type: TINYINT,
            defaultValue: "0",
        },
    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });

}