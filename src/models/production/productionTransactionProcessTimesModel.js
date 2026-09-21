import {
    DATE,
    INTEGER,
    NOW,
    TINYINT,
} from "sequelize";

export const productionTransactionProcessTimesModel = (sequelize) => {
    return sequelize.define(
        "production_transaction_process_times",
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

            actual_time: {
                type: INTEGER,
                allowNull: true,
                comment: "seconds",
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
