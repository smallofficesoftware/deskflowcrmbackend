import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

// What varies for a parent product (Color, Size, ...) - plans/2026-10-18-product-variants-and-qty-pricing-plan.txt, 4.1.
export const productVariantAttributeModel = (sequelize) => {
  return sequelize.define(
    "product_variant_attributes",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      parent_product_id: {
        type: INTEGER,
      },
      attribute_name: {
        type: STRING,
      },
      product_attribute_master_id: {
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
