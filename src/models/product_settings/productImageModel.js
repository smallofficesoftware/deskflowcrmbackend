import { DATE, INTEGER, STRING, TINYINT } from "sequelize";

// Multiple photos per product/variant - plans/2026-10-20-product-variant-ui-and-field-scoping-plan.txt,
// Phase 2. product_id always points to the row's OWN id (a variant is already a full
// products row, so a variant's photos never collide with its parent's or siblings').
export const productImageModel = (sequelize) => {
  return sequelize.define(
    "product_images",
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
        type: INTEGER,
      },
      image_path: {
        type: STRING,
      },
      webp_path: {
        type: STRING,
      },
      thumbnail_path: {
        type: STRING,
      },
      display_order: {
        type: INTEGER,
        defaultValue: 0,
      },
      is_primary: {
        type: TINYINT,
        defaultValue: "0",
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
