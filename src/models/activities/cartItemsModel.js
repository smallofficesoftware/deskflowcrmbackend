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
export const cartItemModel = (sequelize) => {
  return sequelize.define("cart_items", {
    id: {
      type: INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    //   1 => Quotation/Estimate ,2 => Order ,3 => Invoice 4=>Purchase
    cart_type: {
      type: INTEGER,
    },
    cart_id: {
      type: INTEGER,
    },
    currency_id: {
      type: INTEGER,
    },
    conversion_rate: {
      type: STRING,
    },
    a_application_login_id: {
      type: INTEGER,
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
    company_masters_id: {
      type: INTEGER,
    },
    item_category_id: {
      type: INTEGER,
    },
    item_category_name: {
      type: STRING,
    },
    item_product_description: {
      type: TEXT,
    },
    item_product_code: {
      type: INTEGER,
    },
    item_warehouse_id: {
      type: INTEGER,
    },
    item_product_id: {
      type: INTEGER,
    },
    item_product_name: {
      type: STRING,
    },
    item_unit_name: {
      type: STRING,
    },
    inner_qty_unit: {
      type: STRING,
    },
    outer_qty_unit: {
      type: STRING,
    },
    product_inner_qty: {
      type: DOUBLE,
    },
    product_outer_qty: {
      type: DOUBLE,
    },
    item_rate: {
      type: DOUBLE,
    },
    item_gst: {
      type: DOUBLE,
    },
    item_net_rate: {
      type: DOUBLE,
    },
    item_qty: {
      type: DOUBLE,
    },
    item_discount_pct: {
      type: DOUBLE,
    },
    item_discount_pr: {
      type: DOUBLE,
    },
    item_total: {
      type: DOUBLE,
    },
    item_hsn_code: {
      type: STRING,
    },
    cart_date: {
      type: DATEONLY,
    },
    cart_number: {
      type: STRING,
    },
    item_inner_quantity: {
      type: DOUBLE,
    },
    item_outer_quantity: {
      type: DOUBLE,
    },
    item_loose_quantity: {
      type: DOUBLE,
    },
    isDelete: {
      type: TINYINT,
      defaultValue: "0",
    },
    is_serial_num_product_item: {
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
    stock_type: {
      type: TINYINT,
    },
    products_column_number_1: {
      type: INTEGER,
    },
    products_column_number_2: {
      type: INTEGER,
    },
    products_column_number_3: {
      type: INTEGER,
    },
    products_column_number_4: {
      type: INTEGER,
    },
    products_column_number_5: {
      type: INTEGER,
    },
    products_column_text_1: {
      type: STRING,
    },
    products_column_text_2: {
      type: STRING,
    },
    products_column_text_3: {
      type: STRING,
    },
    products_column_text_4: {
      type: STRING,
    },
    products_column_text_5: {
      type: STRING,
    },
    products_column_text_area_1: {
      type: TEXT,
    },
    products_column_text_area_2: {
      type: TEXT,
    },
    products_column_text_area_3: {
      type: TEXT,
    },
    products_column_text_area_4: {
      type: TEXT,
    },
    products_column_text_area_5: {
      type: TEXT,
    },
    products_column_date_1: {
      type: DATEONLY,
    },
    products_column_date_2: {
      type: DATEONLY,
    },
    products_column_date_3: {
      type: DATEONLY,
    },
    products_column_date_4: {
      type: DATEONLY,
    },
    products_column_date_5: {
      type: DATEONLY,
    },
    products_column_date_and_time_1: {
      type: DATE,
    },
    products_column_date_and_time_2: {
      type: DATE,
    },
    products_column_date_and_time_3: {
      type: DATE,
    },
    products_column_date_and_time_4: {
      type: DATE,
    },
    products_column_date_and_time_5: {
      type: DATE,
    },
    products_column_time_1: {
      type: TIME,
    },
    products_column_time_2: {
      type: TIME,
    },
    products_column_time_3: {
      type: TIME,
    },
    products_column_time_4: {
      type: TIME,
    },
    products_column_time_5: {
      type: TIME,
    },
    products_column_switch_1: {
      type: TINYINT,
    },
    products_column_switch_2: {
      type: TINYINT,
    },
    products_column_switch_3: {
      type: TINYINT,
    },
    products_column_switch_4: {
      type: TINYINT,
    },
    products_column_switch_5: {
      type: TINYINT,
    },
    products_column_decimal_1: {
      type: DOUBLE,
    },
    products_column_decimal_2: {
      type: DOUBLE,
    },
    products_column_decimal_3: {
      type: DOUBLE,
    },
    products_column_decimal_4: {
      type: DOUBLE,
    },
    products_column_decimal_5: {
      type: DOUBLE,
    },
    products_column_dropdown_1: {
      type: STRING,
    },
    products_column_dropdown_2: {
      type: STRING,
    },
    products_column_dropdown_3: {
      type: STRING,
    },
    products_column_dropdown_4: {
      type: STRING,
    },
    products_column_dropdown_5: {
      type: STRING,
    },
    products_column_radio_1: {
      type: STRING,
    },
    products_column_radio_2: {
      type: STRING,
    },
    products_column_radio_3: {
      type: STRING,
    },
    products_column_radio_4: {
      type: STRING,
    },
    products_column_radio_5: {
      type: STRING,
    },
    contact_master_id: {
      type: INTEGER,
    },
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });
};
