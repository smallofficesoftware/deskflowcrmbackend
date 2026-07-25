import {
    DATE,
    DATEONLY,
    DOUBLE,
    INTEGER,
    NOW,
    TEXT,
    TINYINT,
} from "sequelize";

export const productionTransactionModel = (sequelize) => {
    return sequelize.define(
        "production_transactions",
        {
            id: {
                type: INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },

            job_id: {
                type: INTEGER,
                allowNull: true,
            },

            team_member: {
                type: INTEGER,
                allowNull: true,
            },

            production_item_id: {
                type: INTEGER,
                allowNull: true,
            },

            bom_id: {
                type: INTEGER,
                allowNull: true,
            },

            production_qty: {
                type: DOUBLE,
                allowNull: false,
            },

            consumption_qty: {
                type: DOUBLE,
                allowNull: false,
            },

            rejection_qty: {
                type: DOUBLE,
                allowNull: false,
            },

            finish_good_stock_adjustment_id: {
                type: INTEGER,
                allowNull: true,
            },

            rejection_stock_adjustment_id: {
                type: INTEGER,
                allowNull: true,
            },

            consumption_good_stock_adjustment_id: {
                type: INTEGER,
                allowNull: true,
            },

            date: {
                type: DATEONLY,
                allowNull: false,
            },

            remark: {
                type: TEXT,
                allowNull: false,
            },

            company_masters_id: {
                type: INTEGER,
                allowNull: true,
            },

            a_application_login_id: {
                type: INTEGER,
                allowNull: true,
            },

            created_date_time: {
                type: DATE,
                allowNull: false,
            },

            s_timestemp: {
                type: "TIMESTAMP",
                allowNull: false,
                defaultValue: NOW,
            },

            isDelete: {
                type: TINYINT,
                allowNull: false,
                defaultValue: 0,
            },

            isActive: {
                type: TINYINT,
                allowNull: false,
                defaultValue: 1,
            },

            modified_date: {
                type: DATE,
                allowNull: false,
                defaultValue: NOW,
            },
        },
        {
            timestamps: true,
            createdAt: "created_date_time",
            updatedAt: "modified_date",
        }
    );
};