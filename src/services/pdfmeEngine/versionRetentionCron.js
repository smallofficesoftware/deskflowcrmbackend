// Daily purge of document_print_template_versions rows older than 60 days
// (§1's "Version history gets a 60-day retention purge" decision) — hard
// delete, disk cleanup only, never touches the live draft_template_json/
// published_template_json on the main row. Reuses the same per-tenant
// connection pattern this repo's other cron jobs already use
// (reminderNotificationServices.js: raw Sequelize instance per tenant_masters
// row, built from that row's own db_host/db_user/db_password/db_name), not a
// new scheduling mechanism — just a new job function registered at boot.
import cron from "node-cron";
import { Op, Sequelize } from "sequelize";
import { documentPrintTemplateVersionModel } from "../../models/company_setup/documentPrintTemplateVersionModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import logger from "../../utils/logger.js";

const RETENTION_DAYS = 60;

async function purgeOldVersionsForTenant(tenant) {
  const tenantSequelize = new Sequelize(
    tenant.db_name,
    tenant.db_user,
    tenant.db_password,
    {
      host: tenant.db_host,
      dialect: "mysql",
      timezone: "+05:30",
      define: { timestamps: false },
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
      logging: false,
    }
  );

  try {
    const Version = documentPrintTemplateVersionModel(tenantSequelize);
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await Version.destroy({ where: { created_date_time: { [Op.lt]: cutoff } } });
    if (deleted > 0) {
      logger.info(`versionRetentionCron: purged ${deleted} old version row(s) for tenant ${tenant.db_name}`);
    }
  } catch (e) {
    logger.error(`versionRetentionCron: failed for tenant ${tenant.db_name}: ${e.message || e}`);
  } finally {
    await tenantSequelize.close();
  }
}

async function runPurge() {
  const tenants = await tenantMasterModel.findAll({
    where: { isDelete: 0 },
    attributes: ["db_host", "db_user", "db_password", "db_name"],
  });

  for (const tenant of tenants) {
    await purgeOldVersionsForTenant(tenant.dataValues);
  }
}

// Runs once daily at 03:00 server time — off-peak, same idea as other
// maintenance-style jobs in this codebase.
export function startVersionRetentionCron() {
  cron.schedule("0 3 * * *", () => {
    runPurge().catch((e) => logger.error(`versionRetentionCron: run failed: ${e.message || e}`));
  });
}
