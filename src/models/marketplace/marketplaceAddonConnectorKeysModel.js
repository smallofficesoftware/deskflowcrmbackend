import { DATE, INTEGER, NOW, STRING, TINYINT } from "sequelize";

// Generic connector-key issuance/revocation history, shared across
// marketplace addons via addon_code (first user: Tally). See
// plans/2026-10-08-marketplace-tally-plan.txt Q5/4.1.
export const marketplaceAddonConnectorKeysModel = (sequelize) => {
  return sequelize.define(
    "marketplace_addon_connector_keys",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER, allowNull: false },
      addon_code: { type: STRING(50), allowNull: false },
      connector_key: { type: STRING(255), allowNull: false },
      issued_date_time: { type: DATE, allowNull: false, defaultValue: NOW },
      revoked_date_time: { type: DATE, allowNull: true },
      last_used_at: { type: DATE, allowNull: true },
      created_date_time: { type: DATE, allowNull: false, defaultValue: NOW },
      isActive: { type: TINYINT, allowNull: false, defaultValue: 1 },
      isDelete: { type: TINYINT, allowNull: false, defaultValue: 0 },
    },
    { timestamps: false }
  );
};
