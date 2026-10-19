import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

// Catalog values for one attribute master (e.g. "Red"/"Blue" under "Color") -
// plans/2026-10-18-product-variants-and-qty-pricing-plan.txt.
export const productAttributeValueMasterModel = (sequelize) => {
  return sequelize.define(
    "product_attribute_value_masters",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      product_attribute_master_id: {
        type: INTEGER,
      },
      value: {
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
