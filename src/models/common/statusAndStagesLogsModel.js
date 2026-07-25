import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";
export const statusAndStagesLogsModel = (sequelize) => {
    return sequelize.define(
        "status_and_stages_logs",
        {
            id: {
                type: INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            reference_table: {
                type: STRING(100),
                allowNull: false,
            },
            reference_id: {
                type: INTEGER,
                allowNull: false,
            },
            information: {
                type: TEXT,
                allowNull: false,
            },
            status_id: {
                type: INTEGER,
                allowNull: false,
            },
            previous_status_id: {
                type: INTEGER,
                allowNull: false,
            },
            updated_by: {
                type: INTEGER,
                allowNull: false,
            },
            updated_date_time: {
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
        },
        {
            tableName: "status_and_stages_logs",
            timestamps: true,
            createdAt: 'created_date_time',
            updatedAt: 'modified_date'
        }
    );
};
