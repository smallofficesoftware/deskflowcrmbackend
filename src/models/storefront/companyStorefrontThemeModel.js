import { DATE, INTEGER, TINYINT } from "sequelize";

// TENANT DB. A company's own active storefront theme pick - plans/2026-10-15-
// ecommerce-b2b-b2c-plan.txt, 4.6. storefront_theme_id points at the MASTER
// DB storefront_themes catalog (storefrontThemeModel.js) - no cross-DB FK,
// resolved in application code.
export const companyStorefrontThemeModel = (sequelize) => {
  return sequelize.define(
    "company_storefront_theme",
    {
      id: {
        type: INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      company_masters_id: {
        type: INTEGER,
      },
      storefront_theme_id: {
        type: INTEGER,
      },
      activated_date: {
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
    },
    {
      timestamps: true,
      createdAt: "created_date_time",
      updatedAt: "modified_date",
      // Table is genuinely singular ("company_storefront_theme", already
      // migrated as such) - without this, Sequelize auto-pluralizes the
      // name passed to define() above to "company_storefront_themes" and
      // every query 404s against a table that doesn't exist.
      freezeTableName: true,
    }
  );
};
