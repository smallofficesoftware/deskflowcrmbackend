import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

// Reusable attribute catalog (e.g. "Color", "Size") - plans/2026-10-18-product-variants-and-qty-pricing-plan.txt.
// Defined once per company, picked on any product's Variant Attributes section instead
// of being typed fresh per product.
export const productAttributeMasterModel = (sequelize) => {
  return sequelize.define(
    "product_attribute_masters",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      attribute_name: {
        type: STRING,
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
