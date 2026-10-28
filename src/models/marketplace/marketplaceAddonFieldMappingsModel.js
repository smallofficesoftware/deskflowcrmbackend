import { DATE, INTEGER, JSON, NOW, STRING, TINYINT } from "sequelize";

// Generic field-level mapping (which CRM column/custom-field feeds which
// addon field/UDF), shared across marketplace addons via addon_code. See
// plans/2026-10-08-marketplace-tally-plan.txt section 4.6.
export const marketplaceAddonFieldMappingsModel = (sequelize) => {
  return sequelize.define(
    "marketplace_addon_field_mappings",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER, allowNull: false },
      addon_code: { type: STRING(50), allowNull: false },
      form_type: { type: INTEGER, allowNull: false },
      source_type: { type: STRING(20), allowNull: false },
      source_ref: { type: STRING(100), allowNull: false },
      external_field_name: { type: STRING(150), allowNull: false },
      direction: { type: STRING(10), allowNull: false, defaultValue: "both" },
      transform: { type: STRING(30), allowNull: false, defaultValue: "none" },
      config_json: { type: JSON, allowNull: true },
      created_date_time: { type: DATE, allowNull: false, defaultValue: NOW },
      modified_date: { type: DATE, allowNull: true },
      isActive: { type: TINYINT, allowNull: false, defaultValue: 1 },
      isDelete: { type: TINYINT, allowNull: false, defaultValue: 0 },
    },
    { timestamps: false }
  );
};
