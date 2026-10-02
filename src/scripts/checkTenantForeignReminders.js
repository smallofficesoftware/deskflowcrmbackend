import dotenv from "dotenv";
import path from "path";
import { Sequelize as SequelizePkg } from "sequelize";

// Read-only. For every tenant DB in tenant_masters, finds reminder_messages
// rows whose company_masters_id is not that tenant's own company (rows that
// were written into the wrong tenant DB).
//
// Usage: node src/scripts/checkTenantForeignReminders.js [concurrency] [--list]
//   --list  also print the stray reminder ids per tenant (ids only, no remark text)

const NODE_ENV = process.env.NODE_ENV || "production";
dotenv.config({ path: path.resolve(process.cwd(), `.env.${NODE_ENV}`) });

const args = process.argv.slice(2);
const LIST_IDS = args.includes("--list");
const CONCURRENCY = Number(args.find((a) => /^\d+$/.test(a))) || 5;

const dialect = "mysql";

const masterSequelize = new SequelizePkg(
  process.env.TENANT_DB_DB_NAME,
  process.env.TENANT_DB_USER_NAME,
  process.env.TENANT_DB_PASSWORD,
  {
    host: process.env.TENANT_DB_HOST_NAME,
    dialect,
    logging: false,
  }
);

const getTenants = async () => {
  const [rows] = await masterSequelize.query(
    "SELECT id, company_masters_id, db_name, db_user, db_password, db_host FROM tenant_masters WHERE isDelete = 0 ORDER BY company_masters_id"
  );
  return rows || [];
};

const checkTenant = async (tenant) => {
  const sequelize = new SequelizePkg(tenant.db_name, tenant.db_user, tenant.db_password, {
    host: tenant.db_host,
    dialect,
    logging: false,
  });

  try {
    const [[tableRow]] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM information_schema.tables
       WHERE table_schema = :dbName AND table_name = 'reminder_messages'`,
      { replacements: { dbName: tenant.db_name } }
    );
    if (!Number(tableRow.c)) {
      return { tenant, status: "no_table" };
    }

    const [[totals]] = await sequelize.query(
      `SELECT COUNT(*) AS total,
              SUM(company_masters_id IS NULL) AS null_company
       FROM reminder_messages`
    );

    const [foreign] = await sequelize.query(
      `SELECT company_masters_id AS company, COUNT(*) AS cnt,
              DATE_FORMAT(MAX(create_date_time), '%Y-%m-%d %H:%i:%s') AS last_date
       FROM reminder_messages
       WHERE company_masters_id IS NOT NULL AND company_masters_id <> :ownCompany AND isDelete = 0
       GROUP BY company_masters_id
       ORDER BY company_masters_id`,
      { replacements: { ownCompany: tenant.company_masters_id } }
    );

    const [byMonth] = foreign.length
      ? await sequelize.query(
          `SELECT DATE_FORMAT(create_date_time, '%Y-%m') AS month, COUNT(*) AS cnt
           FROM reminder_messages
           WHERE company_masters_id IS NOT NULL AND company_masters_id <> :ownCompany AND isDelete = 0
           GROUP BY month`,
          { replacements: { ownCompany: tenant.company_masters_id } }
        )
      : [[]];

    const [byReference] = foreign.length
      ? await sequelize.query(
          `SELECT COALESCE(NULLIF(reference_table, ''), '(none)') AS ref, COUNT(*) AS cnt
           FROM reminder_messages
           WHERE company_masters_id IS NOT NULL AND company_masters_id <> :ownCompany AND isDelete = 0
           GROUP BY ref`,
          { replacements: { ownCompany: tenant.company_masters_id } }
        )
      : [[]];

    let ids = [];
    if (LIST_IDS && foreign.length) {
      const [idRows] = await sequelize.query(
        `SELECT id, company_masters_id AS company,
                DATE_FORMAT(create_date_time, '%Y-%m-%d %H:%i:%s') AS created
         FROM reminder_messages
         WHERE company_masters_id IS NOT NULL AND company_masters_id <> :ownCompany AND isDelete = 0
         ORDER BY id`,
        { replacements: { ownCompany: tenant.company_masters_id } }
      );
      ids = idRows;
    }

    return {
      tenant,
      status: foreign.length ? "foreign" : "clean",
      total: Number(totals.total),
      nullCompany: Number(totals.null_company || 0),
      foreign,
      byMonth,
      byReference,
      ids,
    };
  } catch (error) {
    return { tenant, status: "failed", error: error.message };
  } finally {
    await sequelize.close?.();
  }
};

async function promisePool(items, worker, concurrencyLimit = 1) {
  const results = [];
  let idx = 0;
  async function runner() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        results[i] = { error: e.message };
      }
    }
  }
  const runners = Array.from(
    { length: Math.min(concurrencyLimit, items.length) },
    () => runner()
  );
  await Promise.all(runners);
  return results;
}

(async () => {
  try {
    console.log("Tenant foreign-company reminder check (read-only)");
    console.log(`Started: ${new Date().toISOString()}`);

    const tenants = await getTenants();
    console.log(`Found ${tenants.length} tenant(s) in tenant_masters.`);
    console.log(`Checking with concurrency=${CONCURRENCY}...\n`);

    if (!tenants.length) {
      await masterSequelize.close?.();
      return;
    }

    const results = await promisePool(tenants, checkTenant, CONCURRENCY);

    let cleanCount = 0;
    let foreignCount = 0;
    let failedCount = 0;
    let noTableCount = 0;
    let nullCount = 0;

    results.forEach((result) => {
      if (!result || !result.tenant) return;
      const { tenant, status } = result;
      const label = `company_masters_id=${tenant.company_masters_id} db=${tenant.db_name}`;

      if (status === "failed") {
        failedCount++;
        console.log(`[FAILED] ${label} -- ${result.error}`);
        return;
      }
      if (status === "no_table") {
        noTableCount++;
        console.log(`[NO TABLE] ${label} -- reminder_messages missing`);
        return;
      }

      if (result.nullCompany > 0) {
        nullCount++;
        console.log(`[NULL COMPANY] ${label} -- ${result.nullCompany} row(s) with NULL company_masters_id`);
      }

      if (status === "clean") {
        cleanCount++;
        return;
      }

      foreignCount++;
      const strayTotal = result.foreign.reduce((sum, f) => sum + Number(f.cnt), 0);
      const lastStray = result.foreign
        .map((f) => f.last_date)
        .filter(Boolean)
        .sort()
        .pop();
      console.log(
        `[FOREIGN] ${label} total=${result.total} stray=${strayTotal} last_stray=${lastStray || "n/a"}`
      );
      result.foreign.forEach((f) =>
        console.log(`    from company ${f.company}: ${f.cnt} row(s), last=${f.last_date || "n/a"}`)
      );
      if (LIST_IDS) {
        result.ids.forEach((r) =>
          console.log(`    reminder id=${r.id} company_masters_id=${r.company} created=${r.created || "n/a"}`)
        );
      }
    });

    // Patterns across all tenants: which DBs receive strays, which companies leak, and when.
    const sinks = [];
    const sources = {};
    const months = {};
    const references = {};
    let newestStray = "";
    results.forEach((r) => {
      if (!r || r.status !== "foreign") return;
      const strayTotal = r.foreign.reduce((sum, f) => sum + Number(f.cnt), 0);
      sinks.push({ company: r.tenant.company_masters_id, db: r.tenant.db_name, strayTotal });
      r.foreign.forEach((f) => {
        sources[f.company] = (sources[f.company] || 0) + Number(f.cnt);
        if (f.last_date && f.last_date > newestStray) newestStray = f.last_date;
      });
      r.byMonth.forEach((m) => {
        const key = m.month || "unknown";
        months[key] = (months[key] || 0) + Number(m.cnt);
      });
      r.byReference.forEach((x) => {
        references[x.ref] = (references[x.ref] || 0) + Number(x.cnt);
      });
    });

    if (sinks.length) {
      const top = (entries, n = 10) => entries.sort((a, b) => b[1] - a[1]).slice(0, n);
      console.log("");
      console.log("--- Patterns ---");
      console.log(`Newest stray anywhere: ${newestStray || "n/a"}`);
      console.log(
        "Top destination DBs (strays received): " +
          sinks
            .sort((a, b) => b.strayTotal - a.strayTotal)
            .slice(0, 10)
            .map((s) => `company ${s.company}=${s.strayTotal}`)
            .join(", ")
      );
      console.log(
        "Top source companies (strays leaked out): " +
          top(Object.entries(sources)).map(([c, n]) => `company ${c}=${n}`).join(", ")
      );
      console.log(
        "Strays by reference_table: " +
          top(Object.entries(references), 20).map(([t, n]) => `${t}=${n}`).join(", ")
      );
      console.log(
        "Strays by month created: " +
          Object.entries(months)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([m, n]) => `${m}=${n}`)
            .join(", ")
      );
    }

    console.log("");
    console.log(
      `Summary: ${tenants.length} total | ${cleanCount} clean | ${foreignCount} with foreign reminders | ${nullCount} with NULL company rows | ${noTableCount} without table | ${failedCount} failed to connect`
    );
    console.log(`Finished: ${new Date().toISOString()}`);

    await masterSequelize.close?.();
  } catch (err) {
    console.error("Fatal error:", err.message || err);
    process.exit(1);
  }
})();
