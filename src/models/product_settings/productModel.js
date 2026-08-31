import {
  DATE,
  DATEONLY,
  DOUBLE,
  INTEGER,
  NOW,
  STRING,
  TEXT,
  TIME,
  TINYINT,
} from "sequelize";
export const productModel = (sequelize) => {
  return sequelize.define(
    "products",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      a_application_login_id: {
        type: INTEGER,
      },
      product_name: {
        type: TEXT,
      },
      product_alias: {
        type: TEXT,
      },
      product_code: {
        type: TEXT,
      },
      product_description: {
        type: TEXT,
      },
      created_date_time: {
        type: DATE,
        defaultValue: NOW,
      },
      s_timestemp: {
        type: STRING,
      },
      category_id: {
        type: INTEGER,
      },
      unit: {
        type: STRING,
      },
      unit_id: {
        type: INTEGER,
      },
      product_group_id: {
        type: INTEGER,
      },
      weight_or_size: {
        type: DOUBLE,
      },
      min_stock_quantity: {
        type: DOUBLE,
      },
      max_stock_quantity: {
        type: DOUBLE,
      },
      rate: {
        type: DOUBLE,
      },
      GST: {
        type: DOUBLE,
      },
      gst_id: {
        type: INTEGER,
      },
      net_rate: {
        type: DOUBLE,
      },
      purchase_rate: {
        type: DOUBLE,
      },
      purchase_gst_per: {
        type: DOUBLE,
      },
      purchase_gst_id: {
        type: INTEGER,
      },
      purchase_net_rate: {
        type: DOUBLE,
      },
      product_img: {
        type: STRING,
      },
      product_types: {
        type: INTEGER,
      },
      product_barcode_number: {
        type: STRING,
        allowNull: true,
        unique: true
      },
      product_inner_qty: {
        type: DOUBLE,
      },
      product_outer_qty: {
        type: DOUBLE,
      },
      product_inner_unit: {
        type: INTEGER,
      },
      product_outer_unit: {
        type: INTEGER,
      },
      product_length: {
        type: DOUBLE,
      },
      product_width: {
        type: DOUBLE,
      },
      product_height: {
        type: DOUBLE,
      },
      miracle_UniqueId: {
        type: TEXT,
      },
      miracle_update_date_time: {
        type: DATE,
      },
      miracle_uom_name: {
        type: STRING,
      },
      isDelete: {
        type: TINYINT,
        defaultValue: "0",
      },
      hsn_code: {
        type: STRING,
      },
      // "Product Page Designer" — links to a document_print_templates row
      // (template_purpose='product_page'), spliced after the main document
      // at print time when the resolved main template's
      // include_product_pages flag is on.
      document_template_id: {
        type: INTEGER,
        allowNull: true,
        defaultValue: null,
      },
      isActive: {
        type: TINYINT,
        defaultValue: "1",
      },
      is_serial_number: {
        type: TINYINT,
        defaultValue: "1",
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
    },
    {
      timestamps: true,
      createdAt: 'created_date_time',
      updatedAt: 'modified_date'
    }
  );
};
