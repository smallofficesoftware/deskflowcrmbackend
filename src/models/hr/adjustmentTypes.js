import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const AdjustmentTypes = (sequelize) => {
    return sequelize.define("adjustment_types", {
        id: {
            type: INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },

        method: {
            type: INTEGER,
            allowNull: false,
            comment: "1=Amount, 2=Hours",
        },

        mode: {
            type: INTEGER,
            allowNull: false,
            comment: "1=Credit, 2=Debit",
        },

        name: {
            type: STRING(255),
            allowNull: false,
        },

        knowledge_info: {
            type: TEXT,
            allowNull: false,
        },

        company_masters_id: {
            type: INTEGER,
            allowNull: false,
        },

        a_application_login_id: {
            type: INTEGER,
            allowNull: false,
        },

        created_date_time: {
            type: DATE,
            allowNull: false,
        },

        s_timestemp: {
            type: DATE,
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
        }
    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });

}