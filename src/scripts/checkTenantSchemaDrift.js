import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Sequelize as SequelizePkg } from "sequelize";

const NODE_ENV = process.env.NODE_ENV || "production";
dotenv.config({ path: path.resolve(process.cwd(), `.env.${NODE_ENV}`) });

const REFERENCE_DB_NAME =
  process.argv[2] || "smalloffice_sample_tenant";
const CONCURRENCY = Number(process.argv[3]) || 5;

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
    "SELECT id, company_masters_id, db_name, db_user, db_password, db_host FROM tenant_masters WHERE id > 0"
  );
  return rows || [];
};

const getSchemaColumns = async (host, user, password, dbName) => {
  const sequelize = new SequelizePkg(dbName, user, password, {
    host,
    dialect,
    logging: false,
  });

  try {
    const [rows] = await sequelize.query(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type
       FROM information_schema.columns
       WHERE table_schema = :dbName
       ORDER BY TABLE_NAME, COLUMN_NAME`,
      { replacements: { dbName } }
    );

    const schema = {};
    rows.forEach((row) => {
      if (!schema[row.table_name]) schema[row.table_name] = {};
      schema[row.table_name][row.column_name] = row.column_type;
    });

    return { schema, error: null };
  } catch (error) {
    return { schema: null, error: error.message };
  } finally {
    await sequelize.close?.();
  }
};

const diffSchema = (referenceSchema, tenantSchema) => {
  const differences = [];

  const refTables = Object.keys(referenceSchema);
  const tenantTables = new Set(Object.keys(tenantSchema));

  refTables.forEach((table) => {
    if (!tenantTables.has(table)) {
      differences.push(`  MISSING TABLE: ${table}`);
      return;
    }

    const refColumns = referenceSchema[table];
    const tenantColumns = tenantSchema[table];

    Object.keys(refColumns).forEach((column) => {
      if (!(column in tenantColumns)) {
        differences.push(`  MISSING COLUMN: ${table}.${column} (${refColumns[column]})`);
      } else if (tenantColumns[column] !== refColumns[column]) {
        differences.push(
          `  TYPE MISMATCH: ${table}.${column} -> tenant has "${tenantColumns[column]}", reference has "${refColumns[column]}"`
        );
      }
    });
  });

  const extraTables = Object.keys(tenantSchema).filter(
    (table) => !refTables.includes(table)
  );
  extraTables.forEach((table) => {
    differences.push(`  EXTRA TABLE (not in reference): ${table}`);
  });

  return differences;
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
  const lines = [];
  const log = (msg) => {
    console.log(msg);
    lines.push(msg);
  };

  try {
    log(`Tenant schema drift check`);
    log(`Reference DB: ${REFERENCE_DB_NAME}`);
    log(`Started: ${new Date().toISOString()}`);
    log("");

    const tenants = await getTenants();
    log(`Found ${tenants.length} tenant(s) in tenant_masters.`);

    if (!tenants.length) {
      await masterSequelize.close?.();
      return;
    }

    const referenceTenant =
      tenants.find((t) => t.db_name === REFERENCE_DB_NAME) || {
        db_host: process.env.TENANT_DB_HOST_NAME,
        db_user: process.env.TENANT_DB_USER_NAME,
        db_password: process.env.TENANT_DB_PASSWORD,
      };

    const { schema: referenceSchema, error: refError } =
      await getSchemaColumns(
        referenceTenant.db_host,
        referenceTenant.db_user,
        referenceTenant.db_password,
        REFERENCE_DB_NAME
      );

    if (refError || !referenceSchema) {
      log(`FATAL: could not read reference DB "${REFERENCE_DB_NAME}": ${refError}`);
      await masterSequelize.close?.();
      process.exit(1);
    }

    log(
      `Reference schema loaded: ${Object.keys(referenceSchema).length} tables.`
    );
    log("");
    log(`Checking ${tenants.length} tenant DB(s), concurrency=${CONCURRENCY}...`);
    log("");

    let cleanCount = 0;
    let driftCount = 0;
    let failedCount = 0;

    const results = await promisePool(
      tenants,
      async (tenant) => {
        const { schema, error } = await getSchemaColumns(
          tenant.db_host,
          tenant.db_user,
          tenant.db_password,
          tenant.db_name
        );

        if (error) {
          return { tenant, status: "failed", error };
        }

        const differences = diffSchema(referenceSchema, schema);

        return {
          tenant,
          status: differences.length ? "drift" : "clean",
          differences,
        };
      },
      CONCURRENCY
    );

    results.forEach((result) => {
      if (!result) return;

      const { tenant, status, error, differences } = result;

      if (status === "failed") {
        failedCount++;
        log(
          `[FAILED] company_masters_id=${tenant.company_masters_id} db=${tenant.db_name} -- ${error}`
        );
        return;
      }

      if (status === "clean") {
        cleanCount++;
        return;
      }

      driftCount++;
      log(
        `[DRIFT] company_masters_id=${tenant.company_masters_id} db=${tenant.db_name} host=${tenant.db_host} (${differences.length} difference(s))`
      );
      differences.forEach((d) => log(d));
      log("");
    });

    log("");
    log(`Summary: ${tenants.length} total | ${cleanCount} clean | ${driftCount} with drift | ${failedCount} failed to connect`);
    log(`Finished: ${new Date().toISOString()}`);

    const reportPath = path.join(
      process.cwd(),
      `tenant_schema_diff_report_${Date.now()}.txt`
    );
    fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
    console.log(`\nReport written to: ${reportPath}`);

    await masterSequelize.close?.();
  } catch (err) {
    console.error("Fatal error:", err.message || err);
    process.exit(1);
  }
})();
