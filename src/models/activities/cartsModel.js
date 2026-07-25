import {
  DATE,
  DATEONLY,
  DOUBLE,
  INTEGER,
  STRING,
  TEXT,
  TIME,
  TINYINT
} from "sequelize";

export const cartModel = (sequelize) => {
  return sequelize.define("carts", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    //   1 => Quotation/Estimate ,2 => Order ,3 => Invoice 4=>Purchase
    type: {
      type: TINYINT,
    },
    cart_number: {
      type: STRING,
    },
    sr_by_number: {
      type: INTEGER,
    },
    sr_by_prifix: {
      type: TEXT,
    },
    cart_date: {
      type: DATEONLY,
    },
    cart_status: {
      type: TINYINT,
    },
    a_application_login_id: {
      type: INTEGER,
    },
    due_date: {
      type: DATEONLY,
    },
    company_masters_id: {
      type: INTEGER,
    },
    to_customer_id: {
      type: INTEGER,
    },
    to_customer_name: {
      type: STRING,
    },
    to_customer_email: {
      type: STRING,
    },
    to_customer_phone: {
      type: STRING,
    },
    to_customer_company_name: {
      type: STRING,
    },
    to_customer_gst_number: {
      type: STRING,
    },
    to_customer_price_list_id: {
      type: INTEGER,
    },
    currency_id: {
      type: INTEGER,
    },
    transaction_mode: {
      type: TINYINT,
    },
    country_id: {
      type: INTEGER,
    },
    conversion_rate: {
      type: STRING,
    },
    referance_cart_id: {
      type: STRING,
    },
    referance_cart_name: {
      type: STRING,
    },
    reference_type: {
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
    PinCode: {
      type: STRING,
    },
    Address: {
      type: TEXT,
    },
    shipping_address: {
      type: TEXT,
    },
    cart_remark: {
      type: TEXT,
    },
    cart_terms_and_condition: {
      type: TEXT,
    },
    total_amt: {
      type: DOUBLE,
    },
    total_qty: {
      type: DOUBLE,
    },
    discount_pct: {
      type: DOUBLE,
    },
    discount_pr: {
      type: DOUBLE,
    },
    packing_forwarding_charge: {
      type: DOUBLE,
    },
    transport_charge: {
      type: DOUBLE,
    },
    packing_forwarding_charge_title: {
      type: STRING,
    },
    transport_charge_title: {
      type: STRING,
    },
    taxable_amt: {
      type: DOUBLE,
    },
    cash_discount: {
      type: DOUBLE,
    },
    cash_discount_type: {
      type: TINYINT,
    },
    gst_amt: {
      type: DOUBLE,
    },
    tcs_title: {
      type: STRING,
    },
    tcs_percentage: {
      type: DOUBLE,
    },
    tcs_amt: {
      type: DOUBLE,
    },
    round_off: {
      type: DOUBLE,
    },
    grand_total: {
      type: DOUBLE,
    },
    advance_payment: {
      type: DOUBLE,
    },
    payment_type: {
      type: TINYINT
    },
    is_reminder: {
      type: TINYINT,
    },
    stock_type: {
      type: TINYINT,
    },
    approve_a_application_login_id: {
      type: INTEGER,
    },
    update_Date_time: {
      type: DATE,
    },
    miracle_account_ledger_adv: {
      type: TEXT,
    },
    miracle_account_legder: {
      type: TEXT,
    },
    miracle_UniqueId: {
      type: TEXT,
    },
    miracle_update_date_time: {
      type: DATE,
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
    carts_column_number_1: {
      type: INTEGER,
    },
    carts_column_number_2: {
      type: INTEGER,
    },
    carts_column_number_3: {
      type: INTEGER,
    },
    carts_column_number_4: {
      type: INTEGER,
    },
    carts_column_number_5: {
      type: INTEGER,
    },
    carts_column_text_1: {
      type: STRING,
    },
    carts_column_text_2: {
      type: STRING,
    },
    carts_column_text_3: {
      type: STRING,
    },
    carts_column_text_4: {
      type: STRING,
    },
    carts_column_text_5: {
      type: STRING,
    },
    carts_column_text_area_1: {
      type: TEXT,
    },
    carts_column_text_area_2: {
      type: TEXT,
    },
    carts_column_text_area_3: {
      type: TEXT,
    },
    carts_column_text_area_4: {
      type: TEXT,
    },
    carts_column_text_area_5: {
      type: TEXT,
    },
    carts_column_date_1: {
      type: DATEONLY,
    },
    carts_column_date_2: {
      type: DATEONLY,
    },
    carts_column_date_3: {
      type: DATEONLY,
    },
    carts_column_date_4: {
      type: DATEONLY,
    },
    carts_column_date_5: {
      type: DATEONLY,
    },
    carts_column_date_and_time_1: {
      type: DATE,
    },
    carts_column_date_and_time_2: {
      type: DATE,
    },
    carts_column_date_and_time_3: {
      type: DATE,
    },
    carts_column_date_and_time_4: {
      type: DATE,
    },
    carts_column_date_and_time_5: {
      type: DATE,
    },
    carts_column_time_1: {
      type: TIME,
    },
    carts_column_time_2: {
      type: TIME,
    },
    carts_column_time_3: {
      type: TIME,
    },
    carts_column_time_4: {
      type: TIME,
    },
    carts_column_time_5: {
      type: TIME,
    },
    carts_column_switch_1: {
      type: TINYINT,
    },
    carts_column_switch_2: {
      type: TINYINT,
    },
    carts_column_switch_3: {
      type: TINYINT,
    },
    carts_column_switch_4: {
      type: TINYINT,
    },
    carts_column_switch_5: {
      type: TINYINT,
    },
    carts_column_decimal_1: {
      type: DOUBLE,
    },
    carts_column_decimal_2: {
      type: DOUBLE,
    },
    carts_column_decimal_3: {
      type: DOUBLE,
    },
    carts_column_decimal_4: {
      type: DOUBLE,
    },
    carts_column_decimal_5: {
      type: DOUBLE,
    },
    carts_column_dropdown_1: {
      type: STRING,
    },
    carts_column_dropdown_2: {
      type: STRING,
    },
    carts_column_dropdown_3: {
      type: STRING,
    },
    carts_column_dropdown_4: {
      type: STRING,
    },
    carts_column_dropdown_5: {
      type: STRING,
    },
    carts_column_radio_1: {
      type: STRING,
    },
    carts_column_radio_2: {
      type: STRING,
    },
    carts_column_radio_3: {
      type: STRING,
    },
    carts_column_radio_4: {
      type: STRING,
    },
    carts_column_radio_5: {
      type: STRING,
    },
    carts_column_page_text_1: {
      type: TEXT,
    },
    carts_column_page_text_2: {
      type: TEXT,
    },
    carts_column_page_text_3: {
      type: TEXT,
    },
    carts_column_page_text_4: {
      type: TEXT,
    },
    carts_column_page_text_5: {
      type: TEXT,
    },
    carts_column_page_url_1: {
      type: STRING
    },
    carts_column_page_url_2: {
      type: STRING
    },
    carts_column_page_url_3: {
      type: STRING
    },
    carts_column_page_url_4: {
      type: STRING
    },
    carts_column_page_url_5: {
      type: STRING
    },
    cart_note: {
      type: STRING
    },
    s_timestemp: {
      type: Date,
    },
    temp: {
      type: TINYINT,
    },
    longitude: {
      type: STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    latitude: {
      type: STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    address_location: {
      type: TEXT,
    },
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });
};
