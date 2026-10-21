import { INTEGER, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

// MASTER DB. Theme catalog (Pharmacy first) - plans/2026-10-15-ecommerce-
// b2b-b2c-plan.txt, 4.6. See the matching company_storefront_theme tenant
// model for a company's actual pick.
const storefrontThemeModel = sequelize.define("storefront_themes", {
  id: {
    type: INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  code: {
    type: STRING(50),
  },
  name: {
    type: STRING(100),
  },
  description: {
    type: STRING(255),
  },
  preview_image: {
    type: STRING(255),
  },
  required_tier: {
    type: STRING(20),
  },
  sort_order: {
    type: INTEGER,
  },
  isActive: {
    type: TINYINT,
  },
  isDelete: {
    type: TINYINT,
  },
}, { timestamps: false });

export default storefrontThemeModel;
