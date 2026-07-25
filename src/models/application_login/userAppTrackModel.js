import { DATE, INTEGER, NOW, STRING, TINYINT } from "sequelize";

export const userAppTrackModel = (sequelize) => {
    return sequelize.define("user_app_tracks", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        a_application_login_id: {
            type: INTEGER,
        },
        company_masters_id: {
            type: INTEGER,
        },
        location_switch: {
            type: TINYINT,
            defaultValue: "0",
        },
        location_activity_switch: {
            type: TINYINT,
            defaultValue: "0",
        },
        call_popup_switch: {
            type: TINYINT,
            defaultValue: "0",
        },
        call_history_switch: {
            type: TINYINT,
            defaultValue: "0",
        },
        call_tracker_app: {
            type: TINYINT,
            defaultValue: "0",
        },
        gps: {
            type: TINYINT,
            defaultValue: "0",
        },
        phone_name: {
            type: STRING,
        },
        android_version: {
            type: STRING,
        },
        device_id: {
            type: STRING,
        },
        platform: {
            type: STRING,
        },
        created_date_time: {
            type: DATE,
            defaultValue: NOW,
        },
        modified_date: {
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

}