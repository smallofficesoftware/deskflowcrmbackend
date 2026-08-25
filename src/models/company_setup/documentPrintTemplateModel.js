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
        // 'main' -> a real doc-type template, pickable/settable-default for
        // actual order printing (listDocumentTemplates/list-all both filter
        // to this). 'extra_page' -> created only via the "Document Designer
        // Page" custom field's editor (data_type 14) — shares this same
        // table/doc_type so buildDesignerPageBytes can render it exactly
        // like any other template, but must never appear in /document-
        // designer's own per-doc-type list or the real print-time picker,
        // where it would be confusable with an actual Quotation layout.
        // 'main' | 'extra_page' (Document Designer Page custom field source)
        // | 'product_page' (Product Page Designer source — see products.
        // document_template_id). All three share this one table so
        // buildDesignerPageBytes/product-page splicing can render any of
        // them identically; only 'main' rows are ever listed/pickable as an
        // actual doc-type layout (listDocumentTemplates and every
        // explicit-id print lookup filter to it).
        template_purpose: {
            type: STRING,
            defaultValue: "main",
        },
        // Per-template toggle (not company-wide) — only meaningful on
        // template_purpose='main' rows of the 7 cart-shaped doc types.
        // When on, generate-time splices each cart item's product's own
        // page (products.document_template_id) after the main document, in
        // cart item order.
        include_product_pages: {
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
