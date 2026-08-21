import {
    DATE,
    INTEGER,
    STRING,
    TEXT,
    TINYINT
} from "sequelize";

export const documentPrintTemplateModel = (sequelize) => {
    return sequelize.define("document_print_templates", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        company_masters_id: {
            type: INTEGER,
        },
        doc_type: {
            type: STRING,
        },
        template_name: {
            type: STRING,
        },
        draft_template_json: {
            type: TEXT("long"),
        },
        published_template_json: {
            type: TEXT("long"),
        },
        has_unpublished_changes: {
            type: TINYINT,
            defaultValue: "0",
        },
        is_default: {
            type: TINYINT,
            defaultValue: "0",
        },
        display_order: {
            type: INTEGER,
            defaultValue: "0",
        },
        modify_by: {
            type: INTEGER,
        },
        isDelete: {
            type: TINYINT,
            defaultValue: "0",
        },
        isActive: {
            type: TINYINT,
            defaultValue: "1",
        },
        s_timestemp: {
            type: STRING,
        },
    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date'
    });
};
