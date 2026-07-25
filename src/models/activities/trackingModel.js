import { DATE, DOUBLE, INTEGER, NUMBER, STRING, TEXT, TINYINT } from "sequelize";

export const trackingModel = (sequelize) => {
    return sequelize.define("location_trackings", {
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
        mode: {
            type: INTEGER,
        },
        latitude: {
            type: DOUBLE,
        },
        longitude: {
            type: DOUBLE,
        },
        m_timestamp: {
            type: STRING,
        },
        address: {
            type: TEXT,
        },
        city_locality: {
            type: STRING,
        },
        state_administrative_area: {
            type: STRING,
        },
        country: {
            type: STRING
        },
        postal_code: {
            type: INTEGER
        },
        iso_postal_code: {
            type: STRING
        },
        isDelete: {
            type: TINYINT,
            defaultValue: "0",
        },
        isActive: {
            type: TINYINT,
            defaultValue: "1",
        },
        created_date_time: {
            type: DATE,
        },
        s_timestamp: {
            type: NUMBER,
        }
    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });

}