import { DATE, INTEGER, JSON, NOW, STRING, TINYINT } from "sequelize";

// Generic record-level mapping (CRM record <-> external record, e.g. contact
// <-> Tally ledger), shared across marketplace addons via addon_code. See
// plans/2026-10-08-marketplace-tally-plan.txt Q6/4.1.
export const marketplaceAddonRecordMappingsModel = (sequelize) => {
  return sequelize.define(
    "marketplace_addon_record_mappings",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER, allowNull: false },
      addon_code: { type: STRING(50), allowNull: false },
      entity_type: { type: STRING(50), allowNull: false },
      crm_id: { type: INTEGER, allowNull: true },
      crm_ref: { type: STRING(150), allowNull: true },
      external_id: { type: STRING(150), allowNull: true },
      external_ref: { type: STRING(150), allowNull: true },
      external_alter_id: { type: STRING(50), allowNull: true },
      match_confidence: { type: STRING(20), allowNull: true },
      is_confirmed: { type: TINYINT, allowNull: false, defaultValue: 0 },
      direction: { type: STRING(10), allowNull: false, defaultValue: "both" },
      config_json: { type: JSON, allowNull: true },
      created_date_time: { type: DATE, allowNull: false, defaultValue: NOW },
      modified_date: { type: DATE, allowNull: true },
      isActive: { type: TINYINT, allowNull: false, defaultValue: 1 },
      isDelete: { type: TINYINT, allowNull: false, defaultValue: 0 },
    },
    { timestamps: false }
  );
};
