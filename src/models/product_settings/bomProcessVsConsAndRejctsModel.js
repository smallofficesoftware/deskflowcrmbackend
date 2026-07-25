import { DATE, DOUBLE, INTEGER, NOW, STRING, TINYINT } from "sequelize";

export const bomVsProcessVsConsAndRejctsModel = (sequelize) => {
    return sequelize.define("bom_process_vs_cons_rejcts", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        bom_id: {
            type: INTEGER,
        },
        master_product_id: {
            type: INTEGER,
        },
        process_id: {
            type: INTEGER,
        },
        type: {
            type: TINYINT,
        },
        item_id: {
            type: INTEGER,
        },
        qty: {
            type: DOUBLE,
        },
        unit: {
            type: INTEGER,
        },
        remark: {
            type: STRING,
        },
        is_reusable: {
            type: TINYINT,
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
