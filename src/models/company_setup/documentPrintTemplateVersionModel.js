import {
    DATE,
    INTEGER,
    NOW,
    STRING,
    TEXT
} from "sequelize";

export const documentPrintTemplateVersionModel = (sequelize) => {
    return sequelize.define("document_print_template_versions", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        document_template_id: {
            type: INTEGER,
        },
        version_number: {
            type: INTEGER,
        },
        template_json: {
            type: TEXT("long"),
        },
        change_note: {
            type: STRING,
        },
        modify_by: {
            type: INTEGER,
        },
        created_date_time: {
            type: DATE,
            defaultValue: NOW,
        },
    }, {
        timestamps: false,
    });
};
