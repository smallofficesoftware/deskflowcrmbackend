import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";

export const wrkflwAutoAssignmentContactModel = (sequelize) => {

    return sequelize.define("wrkflw_auto_assignment_of_contacts", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        source_type_id: {
            type: INTEGER,
        },
        country_id: {
            type: INTEGER,
        },
        state_id: {
            type: INTEGER,
        },
        city_id: {
            type: INTEGER,
        },
        area_id: {
            type: INTEGER,
        },
        template_id: {
            type: STRING(100),
        },
        team_person_id: {
            type: INTEGER,
        },
        text_match_description: {
            type: TEXT,
        },

        auto_sequence_flag: {
            type: TINYINT,
        },
        is_recurred: {
            type: TINYINT,
        },
        is_whatsapp_email_send_flag: {
            type: TINYINT,
        },
        send_description: {
            type: TEXT,
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
            defaultValue: NOW,
        },
    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });

}