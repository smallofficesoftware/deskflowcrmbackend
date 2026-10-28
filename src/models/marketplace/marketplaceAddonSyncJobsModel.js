import { DATE, INTEGER, JSON, NOW, STRING, TEXT } from "sequelize";

// Generic job queue the connector polls, shared across marketplace addons via
// addon_code. Flagged as a future merge candidate into a generic, CRM-wide
// smalloffice_sync_jobs table (also absorbing Report Builder's
// report_schedules) - see plans/2026-10-08-marketplace-tally-plan.txt Q5/4.1.
export const marketplaceAddonSyncJobsModel = (sequelize) => {
  return sequelize.define(
    "marketplace_addon_sync_jobs",
    {
      id: { type: INTEGER, autoIncrement: true, primaryKey: true },
      company_masters_id: { type: INTEGER, allowNull: false },
      addon_code: { type: STRING(50), allowNull: false },
      job_type: { type: STRING(50), allowNull: false },
      entity_type: { type: STRING(50), allowNull: true },
      entity_id: { type: INTEGER, allowNull: true },
      direction: { type: STRING(10), allowNull: false },
      status: { type: STRING(20), allowNull: false, defaultValue: "queued" },
      payload_json: { type: JSON, allowNull: true },
      result_json: { type: JSON, allowNull: true },
      error_message: { type: TEXT, allowNull: true },
      attempt_count: { type: INTEGER, allowNull: false, defaultValue: 0 },
      picked_at: { type: DATE, allowNull: true },
      completed_at: { type: DATE, allowNull: true },
      created_date_time: { type: DATE, allowNull: false, defaultValue: NOW },
    },
    { timestamps: false }
  );
};
