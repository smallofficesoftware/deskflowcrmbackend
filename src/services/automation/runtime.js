import { Sequelize } from "sequelize";
import { requestContext } from "../../config/context.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import logger from "../../utils/logger.js";

// Runtime plumbing for automations that run outside an HTTP request
// (emit after response, cron, resumed waits, incoming webhooks).

let ioRef = null;
export const setAutomationIo = (io) => {
  if (io) ioRef = io;
};
export const getAutomationIo = () => ioRef;

/**
 * Build a request-like object so existing services can be called unchanged.
 * `automation` travels with it so emits from those services know the change
 * came from a flow (13.7 chaining).
 */
export const makeReq = ({ tenantDB, company_masters_id, a_application_login_id, body = {}, automation = null }) => ({
  tenantDB,
  body: { a_application_login_id, company_masters_id, ...body },
  query: {},
  params: {},
  headers: { "x-tenant-id": a_application_login_id, "x-company-id": company_masters_id },
  files: {},
  user: { id: a_application_login_id, a_application_login_id, companyId: company_masters_id },
  app: { get: (key) => (key === "io" ? ioRef : undefined) },
  automation,
});

/** Run fn inside the same AsyncLocalStorage store tenantMiddleware sets up. */
export const runInTenantContext = (tenantDB, company_masters_id, a_application_login_id, fn) =>
  requestContext.run(
    {
      tenantDB,
      models: {},
      companyId: Number(company_masters_id),
      tenantId: a_application_login_id,
      a_application_login_id,
    },
    fn
  );

// One pooled connection per tenant database for background work. getTenantDB()
// opens a new Sequelize per call, which is fine per request but would leak
// connections from a 1-minute cron.
const tenantConnections = new Map();

const connectionFor = (row) => {
  const key = `${row.db_host}|${row.db_name}`;
  if (!tenantConnections.has(key)) {
    tenantConnections.set(
      key,
      new Sequelize(row.db_name, row.db_user, row.db_password, {
        host: row.db_host,
        dialect: "mysql",
        timezone: "+05:30",
        define: { timestamps: false },
        pool: { max: 3, min: 0, acquire: 30000, idle: 10000 },
        logging: false,
      })
    );
  }
  return tenantConnections.get(key);
};

/** Distinct tenant databases with the companies that live in each. */
export const listTenantDatabases = async () => {
  const rows = await tenantMasterModel.findAll({
    where: { isDelete: 0 },
    attributes: ["db_host", "db_user", "db_password", "db_name", "company_masters_id", "a_application_login_id"],
    raw: true,
  });
  const byDb = new Map();
  for (const row of rows) {
    const key = `${row.db_host}|${row.db_name}`;
    if (!byDb.has(key)) byDb.set(key, { row, companies: new Set() });
    if (row.company_masters_id) byDb.get(key).companies.add(Number(row.company_masters_id));
  }
  return [...byDb.values()].map(({ row, companies }) => ({
    db_name: row.db_name,
    owner_login_id: row.a_application_login_id,
    companies: [...companies],
    tenantDB: connectionFor(row),
  }));
};

const companyRowCache = new Map();
const COMPANY_ROW_TTL_MS = 5 * 60 * 1000;

/**
 * Shared pooled connection for one company (emit, incoming webhooks).
 * Independent of any request's own connection, which some services close.
 */
export const tenantDBForCompany = async (company_masters_id) => {
  const hit = companyRowCache.get(company_masters_id);
  let row = hit && hit.expires > Date.now() ? hit.row : undefined;
  if (row === undefined) {
    row =
      (await tenantMasterModel.findOne({
        where: { company_masters_id, isDelete: 0 },
        attributes: ["db_host", "db_user", "db_password", "db_name", "a_application_login_id"],
        raw: true,
      })) || null;
    companyRowCache.set(company_masters_id, { row, expires: Date.now() + COMPANY_ROW_TTL_MS });
  }
  if (!row) return null;
  return { tenantDB: connectionFor(row), owner_login_id: row.a_application_login_id };
};

export const tenantKey = (tenantDB) => {
  const c = tenantDB?.config || {};
  return `${c.host || ""}|${c.database || ""}`;
};

export const logError = (where, err) => {
  logger.error(`[automation] ${where}: ${err?.message || err}`);
};
