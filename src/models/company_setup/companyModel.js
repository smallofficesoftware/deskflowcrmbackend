import { DATE, INTEGER, NOW, NUMBER, STRING, TEXT, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

const companyModel = sequelize.define("company_masters", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  category_id_b2b: {
    type: INTEGER,
  },
  sub_category_id_b2b: {
    type: INTEGER,
  },
  company_name: {
    type: STRING,
  },
  company_logo: {
    type: STRING,
  },
  company_sign: {
    type: STRING,
  },
  company_email: {
    type: STRING,
  },
  header_img: {
    type: TEXT,
  },
  footer_img: {
    type: TEXT,
  },
  gst_number: {
    type: STRING,
  },
  currency_id: {
    type: INTEGER,
  },
  qr_code: {
    type: STRING,
    unique: true,
  },
  address: {
    type: TEXT,
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
  bank_detail: {
    type: TEXT,
  },
  terms_and_condition: {
    type: TEXT,
  },
  company_contact: {
    type: STRING,
  },
  printed_number: {
    type: STRING,
  },
  plan_id: {
    type: INTEGER,
  },
  plan_date: {
    type: DATE,
  },
  plan_expiry_date: {
    type: DATE,
  },
  trade_india_user_id: {
    type: STRING,
  },
  trade_india_profile_id: {
    type: STRING,
  },
  trade_india_key: {
    type: TEXT,
  },
  india_mart_api_key: {
    type: TEXT,
  },
  whatsapp_authkey: {
    type: TEXT,
  },
  whatsapp_appkey: {
    type: TEXT,
  },
  chatgpt_appkey: {
    type: TEXT,
  },
  gimini_appkey: {
    type: TEXT,
  },
  company_catalog: {
    type: STRING,
  },
  google_lead_sheet_for_faceBook_1: {
    type: TEXT,
  },
  google_lead_sheet_for_faceBook_2: {
    type: TEXT,
  },
  google_sheet_key_3: {
    type: TEXT,
  },
  google_sheet_key_4: {
    type: TEXT,
  },
  google_sheet_first_name: {
    type: TEXT,
  },
  google_sheet_second_name: {
    type: TEXT,
  },
  google_sheet_third_name: {
    type: TEXT,
  },
  google_sheet_fourth_name: {
    type: TEXT,
  },
  serp_api_key: {
    type: STRING,
  },
  host_out_going_mail: {
    type: STRING,
  },
  port_mail_setup: {
    type: NUMBER,
  },
  mail_id_setup: {
    type: STRING,
  },
  password_mail_setup: {
    type: STRING,
  },
  pop3_host: {
    type: STRING,
  },
  incoming_port: {
    type: INTEGER,
  },
  a_application_login_id: {
    type: INTEGER,
  },
  activation_code: {
    type: STRING,
  },
  company_otp: {
    type: INTEGER,
  },
  // 1=>Verified
  is_email_verified: {
    type: TINYINT,
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
  in_order_image_view: {
    type: INTEGER,
  },
  watermark_in_print: {
    type: INTEGER,
  },
  view_inquiry_form_in_contact: {
    type: INTEGER,
  },
  same_product_multiple_in_cart: {
    type: INTEGER,
  },
  is_contact_validation: {
    type: INTEGER,
  },
  is_strict_check_product_stock: {
    type: INTEGER,
  },
  is_strict_wharehouse_wise_product_stock_check: {
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

  isDelete: {
    type: TINYINT,
    defaultValue: "0",
  },
  isActive: {
    type: TINYINT,
    defaultValue: "1",
  },
  s_timestemp: {
    type: DATE,
  },
  invitation_key: {
    type: STRING,
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
  referral_code_id: {
    type: INTEGER,
  },
  created_date_time: {
    type: DATE,
    defaultValue: NOW,
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


  upi_id: {
    type: STRING,
  },
  upi_name: {
    type: STRING
  },
  banner_img_one: {
    type: TEXT,
  },
  banner_img_two: {
    type: TEXT,
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
  return_sales_invoice_packing_charge_title: {
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
  invoice_series_pattern: {
    type: TEXT
  },
  order_series_pattern: {
    type: TEXT
  },
  return_sales_invoice_series_pattern: {
    type: TEXT
  },
  quotation_series_pattern: {
    type: TEXT
  },
  proforma_invoice_series_pattern: {
    type: TEXT
  },
  purchase_series_pattern: {
    type: TEXT
  },
  return_purchase_invoice_series_pattern: {
    type: TEXT
  },
  purchase_ord_series_pattern: {
    type: TEXT
  },
  inward_series_pattern: {
    type: TEXT
  },
  dispatch_series_pattern: {
    type: TEXT
  },
  order_qty_unit: {
    type: INTEGER,
  },
  quotation_effect_last_data_on_new: {
    type: TINYINT
  },
  proforma_invoice_effect_last_data_on_new: {
    type: TINYINT
  },
  purchase_order_effect_last_data_on_new: {
    type: TINYINT
  },
  return_purchase_invoice_effect_last_data_on_new: {
    type: TINYINT
  },
  purchase_invoice_effect_last_data_on_new: {
    type: TINYINT
  },
  return_sales_invoice_effect_last_data_on_new: {
    type: TINYINT
  },
  order_effect_last_data_on_new: {
    type: TINYINT
  },
  sales_invoice_effect_last_data_on_new: {
    type: TINYINT
  },
  quotation_sr_number_generate_flag: {
    type: TINYINT
  },
  proforma_invoice_sr_number_generate_flag: {
    type: TINYINT
  },
  order_sr_number_generate_flag: {
    type: TINYINT
  },
  sales_invoice_sr_number_generate_flag: {
    type: TINYINT
  },
  return_sales_invoice_sr_number_generate_flag: {
    type: TINYINT
  },
  purchase_order_sr_number_generate_flag: {
    type: TINYINT
  },
  purchase_invoice_sr_number_generate_flag: {
    type: TINYINT
  },
  return_purchase_invoice_sr_number_generate_flag: {
    type: TINYINT
  },
  inward_sr_number_generate_flag: {
    type: TINYINT
  },
  dispatch_sr_number_generate_flag: {
    type: TINYINT
  },
  parent_company_id: {
    type: INTEGER,
    allowNull: true,
  },
});

export default companyModel;
