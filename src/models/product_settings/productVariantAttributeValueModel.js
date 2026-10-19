import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

// Possible values for one attribute (e.g. "Red"/"Blue" under Color) - plans/2026-10-18-product-variants-and-qty-pricing-plan.txt, 4.1.
export const productVariantAttributeValueModel = (sequelize) => {
  return sequelize.define(
    "product_variant_attribute_values",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      product_variant_attribute_id: {
        type: INTEGER,
      },
      value: {
        type: STRING,
      },
      product_attribute_value_master_id: {
        type: INTEGER,
      },
      display_order: {
        type: INTEGER,
        defaultValue: 0,
      },
      isDelete: {
        type: TINYINT,
        defaultValue: "0",
      },
      isActive: {
        type: TINYINT,
        defaultValue: "1",
      },
    },
    {
      timestamps: true,
      createdAt: "created_date_time",
      updatedAt: "modified_date",
    }
  );
};
