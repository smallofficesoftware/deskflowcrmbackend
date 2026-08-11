import { DATE, INTEGER, STRING, TEXT, TINYINT } from "sequelize";

export const customFieldFormModel = (sequelize) => {
  return sequelize.define("custom_field_form_masters", {
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
    title: {
      type: STRING
    },
    data_type: {
      type: INTEGER,
    },
    reference_column_name: {
      type: STRING
    },
    data_sorce: {
      type: TEXT,
      defaultValue: null
    },
    display_order: {
      type: INTEGER,
    },
    required_or_not: {
      type: TINYINT,
    },
    print_or_not: {
      type: TINYINT,
    },
    report_print_or_not: {
      type: TINYINT,
    },
    product_feild_row_column: {
      type: TINYINT,
    },
    required_for: {
      type: TINYINT,
    },
    min_limit: {
      type: TINYINT,
    },
    max_limit: {
      type: TINYINT,
    },
    validation_type: {
      type: TINYINT,
    },
    created_date_time: {
      type: DATE,
    },
    form_type: {
      type: INTEGER
    },
    third_party_field_name: {
      type: STRING,
      defaultValue: null
    },
    applicable_modules: {
      type: STRING,
      defaultValue: null
    },
    isDelete: {
      type: TINYINT,
      defaultValue: "0",
    },

    isActive: {
      type: TINYINT,
      defaultValue: "1",
    },
  }, {
    timestamps: true,
    createdAt: 'created_date_time',
    updatedAt: 'modified_date'
  });

}