import {
    DATE,
    DOUBLE,
    INTEGER,
    NOW,
    TEXT,
    TINYINT,
} from "sequelize";

export const productionTransactionsItemsModel = (sequelize) => {
    return sequelize.define(
        "production_transaction_items",
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

            production_id: {
                type: INTEGER,
                allowNull: true,
            },

            bom_id: {
                type: INTEGER,
                allowNull: true,
            },

            process_id: {
                type: INTEGER,
                allowNull: true,
            },

            entry_type: {
                type: TINYINT,
                allowNull: true,
                comment: "1 - Rejection | 2 - Consumption",
            },

            item_id: {
                type: INTEGER,
                allowNull: true,
            },

            unit: {
                type: TEXT,
                allowNull: true,
            },

            qty: {
                type: DOUBLE,
                allowNull: false,
            },

            warehouse: {
                type: INTEGER,
                allowNull: true,
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