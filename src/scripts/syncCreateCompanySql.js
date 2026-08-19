// Auto-discovers tables that exist in the reference tenant DB
// (smalloffice_sample_tenant) but are missing from create_company_copy.sql,
// and appends a structure-only `CREATE TABLE x LIKE ...` line for each.
//
// This does NOT decide whether a table also needs its data copied
// (INSERT SELECT) — that's a judgment call (see CLAUDE.md's schema-change
// checklist) and stays a manual edit. This script only closes the "forgot
// to add the LIKE line entirely" gap, defaulting new tables to the safe,
// structure-only behavior every table already has unless someone
// deliberately adds a data-copy block.
//
// Usage: node src/scripts/syncCreateCompanySql.js [referenceDbName]
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Sequelize as SequelizePkg } from "sequelize";

const NODE_ENV = process.env.NODE_ENV || "production";
dotenv.config({ path: path.resolve(process.cwd(), `.env.${NODE_ENV}`) });

const REFERENCE_DB_NAME = process.argv[2] || "smalloffice_sample_tenant";

const SQL_FILE_PATH = path.join(
  process.cwd(),
  "new_company_creation_sql/SQL/create-company/create_company_copy.sql"
);

const AUTO_SYNC_MARKER_START = "-- === auto-synced structure-only tables (syncCreateCompanySql.js) ===";

const getReferenceTables = async () => {
  const sequelize = new SequelizePkg(
    REFERENCE_DB_NAME,
    process.env.TENANT_DB_USER_NAME,
    process.env.TENANT_DB_PASSWORD,
    {
      host: process.env.TENANT_DB_HOST_NAME,
      dialect: "mysql",
      logging: false,
    }
  );

  try {
    const [rows] = await sequelize.query(
      `SELECT TABLE_NAME AS table_name
       FROM information_schema.tables
       WHERE table_schema = :dbName AND table_type = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      { replacements: { dbName: REFERENCE_DB_NAME } }
    );
    return rows.map((r) => r.table_name);
  } finally {
    await sequelize.close?.();
  }
};

const getReferencedTablesInSql = (sqlContent) => {
  const pattern = new RegExp(
    "CREATE TABLE `([a-zA-Z0-9_]+)`\\s+LIKE\\s+" + REFERENCE_DB_NAME + "\\.",
    "gi"
  );
  const found = new Set();
  let match;
  while ((match = pattern.exec(sqlContent)) !== null) {
    found.add(match[1]);
  }
  return found;
};

(async () => {
  console.log(`Sync create_company_copy.sql against reference DB: ${REFERENCE_DB_NAME}`);

  if (!fs.existsSync(SQL_FILE_PATH)) {
    console.error(`FATAL: SQL file not found at ${SQL_FILE_PATH}`);
    process.exit(1);
  }

  const referenceTables = await getReferenceTables();
  console.log(`Reference DB has ${referenceTables.length} table(s).`);

  const sqlContent = fs.readFileSync(SQL_FILE_PATH, "utf8");
  const referencedTables = getReferencedTablesInSql(sqlContent);
  console.log(`create_company_copy.sql already references ${referencedTables.size} table(s).`);

  const missingTables = referenceTables.filter((t) => !referencedTables.has(t));

  if (missingTables.length === 0) {
    console.log("Nothing to do — every reference table is already covered.");
    return;
  }

  console.log(`Found ${missingTables.length} table(s) missing from the script:`);
  missingTables.forEach((t) => console.log(`  - ${t}`));

  const newLines = missingTables.map(
    (t) => `CREATE TABLE \`${t}\` LIKE ${REFERENCE_DB_NAME}.${t};`
  );

  let updatedContent;
  if (sqlContent.includes(AUTO_SYNC_MARKER_START)) {
    // Append into the existing auto-sync block instead of starting a new one.
    updatedContent = sqlContent.replace(
      AUTO_SYNC_MARKER_START,
      `${AUTO_SYNC_MARKER_START}\n${newLines.join("\n")}`
    );
  } else {
    updatedContent =
      sqlContent.trimEnd() +
      `\n\n${AUTO_SYNC_MARKER_START}\n` +
      `-- Added ${new Date().toISOString()} — structure-only. If any of these also\n` +
      `-- need seed data copied into every new company, move it out of this block\n` +
      `-- and add the INSERT SELECT pattern manually (see other tables above).\n` +
      newLines.join("\n") +
      "\n";
  }

  fs.writeFileSync(SQL_FILE_PATH, updatedContent, "utf8");
  console.log(`\nAppended ${missingTables.length} structure-only line(s) to:\n  ${SQL_FILE_PATH}`);
  console.log("Review the new block, decide if any of these need data copied too, then commit.");
})().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
