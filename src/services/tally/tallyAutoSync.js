// Auto-send of new sales invoices and receipts to Tally (plans/2026-10-08-marketplace-tally-plan.txt,
// "like Miracle": a manual Send button AND an automatic path). Registered at boot from index.js,
// same node-cron + one short-lived connection per tenant pattern as versionRetentionCron.js.
//
// Guard rails, because this runs unattended against someone's accounts:
//  - only companies with the Tally addon ENABLED and the switch for that document type ON;
//  - only documents created AFTER the switch was turned on (auto_sync.since_*), so turning it on
//    never pushes history - older documents go through the manual Send;
//  - only documents with no mapping (never sent) AND no job at all, so a document that failed is
//    left for a person to look at instead of being retried every tick;
//  - a bounded batch per company per tick, and ticks never overlap.
import cron from "node-cron";
import { Op, Sequelize } from "sequelize";
import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import { marketplaceAddonRecordMappingsModel } from "../../models/marketplace/marketplaceAddonRecordMappingsModel.js";
import { marketplaceAddonSyncJobsModel } from "../../models/marketplace/marketplaceAddonSyncJobsModel.js";
import logger from "../../utils/logger.js";
import { loadTallyConfig, queueTallyVouchers } from "./tallyVoucherService.js";

const ADDON_CODE = "tally";
const BATCH_PER_COMPANY = 50;
const CANDIDATES_SCANNED = 300;

let running = false;

/** Ids of documents created since `since` that Tally has never been offered. */
export const findAutoSyncCandidates = async ({ tenantDB, company_masters_id, entity, since }) => {
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) return [];

  const rows =
    entity === "invoice"
      ? await cartModel(tenantDB).findAll({
          where: { type: 3, isDelete: 0, created_date_time: { [Op.gte]: sinceDate } },
          attributes: ["id"],
          order: [["id", "ASC"]],
          limit: CANDIDATES_SCANNED,
          raw: true,
        })
      : await accountTransactionsModel(tenantDB).findAll({
          where: { type: 1, isDelete: 0, mode: { [Op.gt]: 0 }, created_date_time: { [Op.gte]: sinceDate } },
          attributes: ["id"],
          order: [["id", "ASC"]],
          limit: CANDIDATES_SCANNED,
          raw: true,
        });
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];

  const sent = await marketplaceAddonRecordMappingsModel(tenantDB).findAll({
    where: { company_masters_id, addon_code: ADDON_CODE, entity_type: entity, crm_id: { [Op.in]: ids }, isDelete: 0 },
    attributes: ["crm_id"],
    raw: true,
  });
  const tried = await marketplaceAddonSyncJobsModel(tenantDB).findAll({
    where: { company_masters_id, addon_code: ADDON_CODE, job_type: "push_voucher", entity_type: entity, entity_id: { [Op.in]: ids } },
    attributes: ["entity_id"],
    raw: true,
  });
  const skip = new Set([...sent.map((s) => s.crm_id), ...tried.map((t) => t.entity_id)]);
  return ids.filter((id) => !skip.has(id)).slice(0, BATCH_PER_COMPANY);
};

async function syncTenant(tenant) {
  const tenantDB = new Sequelize(tenant.db_name, tenant.db_user, tenant.db_password, {
    host: tenant.db_host,
    dialect: "mysql",
    timezone: "+05:30",
    define: { timestamps: false },
    pool: { max: 2, min: 0, acquire: 30000, idle: 5000 },
    logging: false,
  });
  try {
    const company_masters_id = tenant.company_masters_id;
    const config = await loadTallyConfig(tenantDB, company_masters_id);
    const auto = config.auto_sync || {};
    if (!auto.invoices && !auto.receipts) return;

    const { enabled } = await isAppEnabledForCompany(tenantDB, company_masters_id, ADDON_CODE);
    if (!enabled) return;

    for (const [entity, flag, sinceKey] of [
      ["invoice", auto.invoices, "since_invoices"],
      ["receipt", auto.receipts, "since_receipts"],
    ]) {
      if (!flag || !auto[sinceKey]) continue;
      const ids = await findAutoSyncCandidates({ tenantDB, company_masters_id, entity, since: auto[sinceKey] });
      if (!ids.length) continue;
      const results = await queueTallyVouchers({ tenantDB, company_masters_id, entity, ids });
      const queued = results.filter((r) => r.status === "queued").length;
      const blocked = results.filter((r) => r.status === "blocked");
      logger.info(`tallyAutoSync: company ${company_masters_id} ${entity}: queued ${queued}, blocked ${blocked.length}`);
      for (const b of blocked) logger.warn(`tallyAutoSync: company ${company_masters_id} ${entity} #${b.id} blocked: ${(b.problems || []).join(" ")}`);
    }
  } catch (error) {
    logger.error(`tallyAutoSync: tenant ${tenant.db_name} failed: ${error?.message || error}`);
  } finally {
    await tenantDB.close();
  }
}

export async function runTallyAutoSync() {
  if (running) return;
  running = true;
  try {
    const tenants = await tenantMasterModel.findAll({
      where: { isDelete: 0 },
      attributes: ["db_host", "db_user", "db_password", "db_name", "company_masters_id"],
    });
    for (const tenant of tenants) await syncTenant(tenant.dataValues);
  } catch (error) {
    logger.error(`tallyAutoSync: run failed: ${error?.message || error}`);
  } finally {
    running = false;
  }
}

// Every 10 minutes. Each run opens one short-lived connection per tenant, so the interval is a
// trade-off against the number of tenants - lengthen it if that count grows a lot.
export function startTallyAutoSyncCron() {
  cron.schedule("*/10 * * * *", () => {
    runTallyAutoSync();
  });
}
