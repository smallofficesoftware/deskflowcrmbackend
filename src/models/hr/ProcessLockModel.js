import { DATE, INTEGER, NOW, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const ProcessLockModel = sequelize.define("process_locks", {
    id: {
        type: INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    company_masters_id: {
        type: INTEGER,
        allowNull: false,
    },
    process_type: {
        type: STRING(50),
        allowNull: false,
        // 'attendance' | 'salary' | 'compensation'
    },
    is_locked: {
        type: TINYINT,
        allowNull: false,
        defaultValue: 0,
    },
    locked_by: {
        type: INTEGER, // a_application_login_id of whoever triggered it
        allowNull: true,
    },
    locked_at: {
        type: DATE,
        allowNull: true,
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

}, {
    tableName: "process_locks",
    timestamps: true,
    createdAt: "created_date_time",
    updatedAt: "modified_date",
    indexes: [
        {
            unique: true,
            fields: ["company_masters_id", "process_type", "isDelete"],
            name: "company_process_unique",
        },
    ],
});

export default ProcessLockModel;
