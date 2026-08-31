import { DATE, DOUBLE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const JobCardsModel = (sequelize) => {
    return sequelize.define("job_cards", {
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
        contact_id: {
            type: INTEGER,
        },
        order_id: {
            type: INTEGER,
        },
        item_id: {
            type: INTEGER,
        },
        job_card_type: {
            type: TINYINT,
            defaultValue: 1, // 1 = from order, 2 = direct product, 3 = for customer
        },
        production_qty: {
            type: DOUBLE,
        },
        status_id: {
            type: INTEGER,
        },
        label_ids: {
            type: TEXT,
        },
        team_assign_ids: {
            type: TEXT,
        },
        created_date_time: {
            type: DATE,
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