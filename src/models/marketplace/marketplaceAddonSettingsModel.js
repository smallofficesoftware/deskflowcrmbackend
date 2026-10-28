import { DATE, INTEGER, JSON, NOW, STRING, TINYINT } from "sequelize";

// Generic, addon_code-discriminated settings table shared by every connector-
// based marketplace addon (first user: Tally) - NOT addon-specific, so this
// factory lives under models/marketplace/, not models/tally/. See
// plans/2026-10-08-marketplace-tally-plan.txt section 4.1.
export const marketplaceAddonSettingsModel = (sequelize) => {
  return sequelize.define(
    "marketplace_addon_settings",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER, allowNull: false },
      addon_code: { type: STRING(50), allowNull: false },
      connection_mode: { type: STRING(20), allowNull: true },
      direct_url_host: { type: STRING(255), allowNull: true },
      direct_url_port: { type: INTEGER, allowNull: true },
      config_json: { type: JSON, allowNull: true },
      last_sync_at: { type: DATE, allowNull: true },
      created_date_time: { type: DATE, allowNull: false, defaultValue: NOW },
      modified_date: { type: DATE, allowNull: true },
      isActive: { type: TINYINT, allowNull: false, defaultValue: 1 },
      isDelete: { type: TINYINT, allowNull: false, defaultValue: 0 },
    },
    { timestamps: false }
  );
};
