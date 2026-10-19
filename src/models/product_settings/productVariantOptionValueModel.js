import { DATE, INTEGER, TINYINT } from "sequelize";

// Which attribute value a specific variant (a real products row, via product_id) carries -
// one row per variant per attribute. plans/2026-10-18-product-variants-and-qty-pricing-plan.txt, 4.1.
export const productVariantOptionValueModel = (sequelize) => {
  return sequelize.define(
    "product_variant_option_values",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      product_id: {
        // The VARIANT row itself, not the parent.
        type: INTEGER,
      },
      product_variant_attribute_value_id: {
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
    },
    {
      timestamps: true,
      createdAt: "created_date_time",
      updatedAt: false,
    }
  );
};
