import { DATE, INTEGER, NOW, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const companyVsSetPrefixModel = sequelize.define("company_masters_vs_set_prefixes", {
    id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    company_id: {
        type: INTEGER,
    },
    order_prefix: {
        type: STRING,
    },
    order_title: {
        type: STRING,
    },
    order_doc_no: {
        type: STRING,
    },
    order_view_color: {
        type: STRING,
    },
    order_view_formate: {
        type: INTEGER,
    },
    invoice_prefix: {
        type: STRING,
    },
    invoice_title: {
        type: STRING,
    },
    invoice_doc_no: {
        type: STRING,
    },
    invoice_view_color: {
        type: STRING,
    },
    invoice_view_formate: {
        type: INTEGER,
    },
    quotation_prefix: {
        type: STRING,
    },
    quotation_title: {
        type: STRING,
    },
    quotation_doc_no: {
        type: STRING,
    },
    quotation_view_color: {
        type: STRING,
    },
    quotation_view_formate: {
        type: INTEGER,
    },

    proforma_invoice_prefix: {
        type: STRING,
    },
    proforma_invoice_title: {
        type: STRING,
    },
    proforma_invoice_doc_no: {
        type: STRING,
    },
    proforma_invoice_view_color: {
        type: STRING,
    },
    proforma_invoice_view_formate: {
        type: INTEGER,
    },

    return_sales_invoice_prefix: {
        type: STRING,
    },
    return_sales_invoice_title: {
        type: STRING,
    },
    return_sales_invoice_doc_no: {
        type: STRING,
    },
    return_sales_invoice_view_color: {
        type: STRING,
    },
    return_sales_invoice_view_formate: {
        type: INTEGER,
    },
    return_purchase_invoice_prefix: {
        type: STRING,
    },
    return_purchase_invoice_title: {
        type: STRING,
    },
    return_purchase_invoice_doc_no: {
        type: STRING,
    },
    return_purchase_invoice_view_color: {
        type: STRING,
    },
    return_purchase_invoice_view_formate: {
        type: INTEGER,
    },

    purchase_ord_prefix: {
        type: STRING,
    },
    purchase_order_title: {
        type: STRING,
    },
    purchase_order_doc_no: {
        type: STRING,
    },
    purchase_order_view_color: {
        type: STRING,
    },
    purchase_order_view_formate: {
        type: INTEGER,
    },

    purchase_prefix: {
        type: STRING,
    },
    purchase_title: {
        type: STRING,
    },
    purchase_doc_no: {
        type: STRING,
    },
    purchase_view_color: {
        type: STRING,
    },
    purchase_view_formate: {
        type: INTEGER,
    },
    workorder_prefix: {
        type: STRING,
    },
    workorder_title: {
        type: STRING,
    },
    workorder_doc_no: {
        type: STRING,
    },
    workorder_view_color: {
        type: STRING,
    },
    workorder_view_formate: {
        type: INTEGER,
    },
    purchase_ord_prefix: {
        type: STRING,
    },
    purchase_order_title: {
        type: STRING,
    },
    purchase_order_doc_no: {
        type: STRING,
    },
    purchase_order_view_color: {
        type: STRING,
    },
    purchase_order_view_formate: {
        type: INTEGER,
    },
    quotation_terms_conditions: {
        type: TEXT,
    },
    quotation_remark: {
        type: TEXT,
    },
    quotation_note: {
        type: STRING,
    },
    proforma_invoice_terms_conditions: {
        type: TEXT,
    },
    proforma_invoice_remark: {
        type: TEXT,
    },
    proforma_invoice_note: {
        type: STRING,
    },
    order_terms_conditions: {
        type: TEXT,
    },
    order_remark: {
        type: TEXT,
    },
    order_note: {
        type: STRING,
    },
    sales_invoice_terms_conditions: {
        type: TEXT,
    },
    sales_invoice_remark: {
        type: TEXT,
    },
    sales_invoice_note: {
        type: STRING,
    },
    return_sales_invoice_terms_conditions: {
        type: TEXT,
    },
    return_sales_invoice_remark: {
        type: TEXT,
    },
    return_sales_invoice_note: {
        type: STRING,
    },
    purchase_order_terms_conditions: {
        type: TEXT,
    },
    purchase_order_remark: {
        type: TEXT,
    },
    purchase_order_note: {
        type: STRING,
    },
    purchase_invoice_terms_conditions: {
        type: TEXT,
    },
    purchase_invoice_remark: {
        type: TEXT,
    },
    purchase_invoice_note: {
        type: STRING,
    },
    return_purchase_invoice_terms_conditions: {
        type: TEXT,
    },
    return_purchase_invoice_remark: {
        type: TEXT,
    },
    return_purchase_invoice_note: {
        type: STRING,
    },
    work_order_terms_conditions: {
        type: TEXT,
    },
    work_order_remark: {
        type: TEXT,
    },
    work_order_note: {
        type: STRING,
    },

    inward_prefix: {
        type: STRING,
    },
    inward_title: {
        type: STRING,
    },
    inward_view_color: {
        type: STRING,
    },
    inward_view_formate: {
        type: STRING,
    },
    inward_view_formate: {
        type: INTEGER,
    },

    inward_terms_conditions: {
        type: TEXT,
    },
    inward_remark: {
        type: TEXT,
    },
    inward_note: {
        type: STRING,
    },

    dispatch_prefix: {
        type: STRING,
    },
    dispatch_title: {
        type: STRING,
    },
    dispatch_view_color: {
        type: STRING,
    },
    dispatch_view_formate: {
        type: STRING,
    },
    dispatch_view_formate: {
        type: INTEGER,
    },

    dispatch_terms_conditions: {
        type: TEXT,
    },
    dispatch_remark: {
        type: TEXT,
    },
    dispatch_note: {
        type: STRING,
    },
    quotation_packing_charge_title: {
        type: TEXT,
    },
    quotation_transport_charge_title: {
        type: TEXT,
    },
    quotation_tcs_title: {
        type: TEXT,
    },
    quotation_tsc_percentage: {
        type: STRING,
    },
    proforma_invoice_packing_charge_title: {
        type: TEXT,
    },
    proforma_invoice_transport_charge_title: {
        type: TEXT,
    },
    proforma_invoice_tcs_title: {
        type: TEXT,
    },
    proforma_invoice_tsc_percentage: {
        type: STRING,
    },
    order_packing_charge_title: {
        type: TEXT,
    },
    order_transport_charge_title: {
        type: TEXT,
    },
    order_tcs_title: {
        type: TEXT,
    },
    order_tsc_percentage: {
        type: STRING,
    },
    sales_invoice_packing_charge_title: {
        type: TEXT,
    },
    sales_invoice_transport_charge_title: {
        type: TEXT,
    },
    sales_invoice_tcs_title: {
        type: TEXT,
    },
    sales_invoice_tsc_percentage: {
        type: STRING,
    },
    return_purchase_invoice_packing_charge_title: {
        type: TEXT,
    },
    return_sales_invoice_transport_charge_title: {
        type: TEXT,
    },
    return_sales_invoice_tcs_title: {
        type: TEXT,
    },
    return_sales_invoice_tsc_percentage: {
        type: STRING,
    },
    purchase_order_packing_charge_title: {
        type: TEXT,
    },
    purchase_order_transport_charge_title: {
        type: TEXT,
    },
    purchase_order_tcs_title: {
        type: TEXT,
    },
    purchase_order_tsc_percentage: {
        type: STRING,
    },
    purchase_invoice_packing_charge_title: {
        type: TEXT,
    },
    purchase_invoice_transport_charge_title: {
        type: TEXT,
    },
    purchase_invoice_tcs_title: {
        type: TEXT,
    },
    purchase_invoice_tsc_percentage: {
        type: STRING,
    },
    return_purchase_invoice_packing_charge_title: {
        type: TEXT,
    },
    return_purchase_invoice_transport_charge_title: {
        type: TEXT,
    },
    return_purchase_invoice_tcs_title: {
        type: TEXT,
    },
    return_purchase_invoice_tsc_percentage: {
        type: STRING,
    },
    work_order_packing_charge_title: {
        type: TEXT,
    },
    work_order_transport_charge_title: {
        type: TEXT,
    },
    work_order_tcs_title: {
        type: TEXT,
    },
    work_order_tsc_percentage: {
        type: STRING,
    },
    inward_packing_charge_title: {
        type: TEXT,
    },
    inward_transport_charge_title: {
        type: TEXT,
    },
    inward_tcs_title: {
        type: TEXT,
    },
    inward_tsc_percentage: {
        type: STRING,
    },
    dispatch_packing_charge_title: {
        type: TEXT,
    },
    dispatch_transport_charge_title: {
        type: TEXT,
    },
    dispatch_tcs_title: {
        type: TEXT,
    },
    dispatch_tsc_percentage: {
        type: STRING,
    },

    s_timestemp: {
        type: DATE,
    },
    created_date_time: {
        type: DATE,
        defaultValue: NOW,
    },
    isDelete: {
        type: TINYINT,
        defaultValue: "0",
    },
    isActive: {
        type: TINYINT,
        defaultValue: "1",
    },
});

export default companyVsSetPrefixModel;