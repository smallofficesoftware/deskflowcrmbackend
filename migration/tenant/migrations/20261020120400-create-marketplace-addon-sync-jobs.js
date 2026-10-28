/**
 * Migration Name: create-marketplace-addon-sync-jobs
 * Database Type: TENANT
 * Created: 20/10/2026
 *
 * Generic job queue the connector polls, shared across marketplace addons via
 * addon_code - plans/2026-10-08-marketplace-tally-plan.txt Q5/4.1. Replaces that
 * plan's earlier, never-schema'd tally_sync_jobs. Flagged in the plan as a
 * future merge candidate into a generic, CRM-wide smalloffice_sync_jobs table
 * (also absorbing Report Builder's report_schedules) - that merge is NOT this
 * migration's job; this table is designed to translate into it with a column
 * map, not a redesign, when that generic table exists.
 */

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.map((t) => (typeof t === "string" ? t : t.tableName)).includes(table);
};

export const up = async (queryInterface, Sequelize) => {
  if (await tableExists(queryInterface, "marketplace_addon_sync_jobs")) return;

  await queryInterface.createTable("marketplace_addon_sync_jobs", {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    company_masters_id: { type: Sequelize.INTEGER, allowNull: false },
    addon_code: { type: Sequelize.STRING(50), allowNull: false },
    job_type: { type: Sequelize.STRING(50), allowNull: false },
    entity_type: { type: Sequelize.STRING(50), allowNull: true },
    entity_id: { type: Sequelize.INTEGER, allowNull: true },
    direction: { type: Sequelize.STRING(10), allowNull: false },
    status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "queued" },
    payload_json: { type: Sequelize.JSON, allowNull: true },
    result_json: { type: Sequelize.JSON, allowNull: true },
    error_message: { type: Sequelize.TEXT, allowNull: true },
    attempt_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    picked_at: { type: Sequelize.DATE, allowNull: true },
    completed_at: { type: Sequelize.DATE, allowNull: true },
    created_date_time: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
  });

  await queryInterface.addIndex("marketplace_addon_sync_jobs", {
    fields: ["company_masters_id", "addon_code", "status"],
    name: "idx_masj_company_addon_status",
  });
};

export const down = async (queryInterface) => {
  if (await tableExists(queryInterface, "marketplace_addon_sync_jobs")) {
    await queryInterface.dropTable("marketplace_addon_sync_jobs");
  }
};
