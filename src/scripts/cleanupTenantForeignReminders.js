import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Sequelize as SequelizePkg } from "sequelize";

// Cleans up reminders that were written into the wrong tenant DB
// (reminder_messages.company_masters_id != the tenant DB's own company).
// Finds them the same way as checkTenantForeignReminders.js.
//
// DRY RUN by default - nothing is written unless --apply is passed.
//
// Usage: node src/scripts/cleanupTenantForeignReminders.js [--apply] [--company=<destCompanyId>]
//   --company=<id>  only look at strays sitting in that tenant's DB (stage the rollout)
//   --apply         actually do it
//   --delete-only   do not copy anything into the owning company's DB; soft-delete every stray
//                   (isDelete = 1) where it was found. No owner-DB lookups are made.
//
// Per live stray row (isDelete = 0), in the tenant DB it was found in (the "destination"):
//   MOVE          its own company's DB has no copy, and the message it points at exists there
//                 -> insert a copy into the owning company's DB, then soft-delete it here
//   DUPLICATE     its own company's DB already has the same reminder -> soft-delete it here
//   ORPHAN        the message it points at does not exist (or belongs to another contact) in the
//                 owning company's DB -> left untouched, reported
//   NO_SOURCE_DB  the owning company has no tenant DB -> left untouched, reported
//   FAILED        error while processing -> left untouched, reported
// Rows are soft-deleted (isDelete = 1), never hard-deleted. With --apply, every row that will be
// touched is first written in full to reminder_cleanup_backup_<timestamp>.json (contains remarks
// and phone numbers - keep it private, do not commit it).

const NODE_ENV = process.env.NODE_ENV || "production";
dotenv.config({ path: path.resolve(process.cwd(), `.env.${NODE_ENV}`) });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DELETE_ONLY = args.includes("--delete-only");
const companyArg = args.find((a) => a.startsWith("--company="));
const ONLY_COMPANY = companyArg ? Number(companyArg.split("=")[1]) : null;

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

// dateStrings keeps DATETIME values as the exact stored text, so copying a row
// between databases cannot shift times through timezone conversion.
const connect = (tenant) =>
  new SequelizePkg(tenant.db_name, tenant.db_user, tenant.db_password, {
    host: tenant.db_host,
    dialect,
    logging: false,
    dialectOptions: { dateStrings: true },
  });

const connections = new Map(); // company_masters_id -> { sequelize, columns }

const getConnection = async (tenant) => {
  const key = tenant.company_masters_id;
  if (connections.has(key)) return connections.get(key);
  const sequelize = connect(tenant);
  const [cols] = await sequelize.query(
    `SELECT COLUMN_NAME AS name FROM information_schema.columns
     WHERE table_schema = :dbName AND table_name = 'reminder_messages'`,
    { replacements: { dbName: tenant.db_name } }
  );
  const entry = { sequelize, columns: new Set(cols.map((c) => c.name)), tenant };
  connections.set(key, entry);
  return entry;
};

const closeAll = async () => {
  for (const { sequelize } of connections.values()) await sequelize.close?.();
};

// Does the message this reminder points at exist in the owning company's DB, for the same contact?
const referenceExists = async (source, row) => {
  const table = row.reference_table;
  if (!row.reference_id) return true; // standalone reminder, nothing to verify
  if (table === "contact_message_histories") {
    const [[msg]] = await source.sequelize.query(
      "SELECT contact_masters_id FROM contact_message_histories WHERE id = :id LIMIT 1",
      { replacements: { id: row.reference_id } }
    );
    if (!msg) return false;
    const strayContact = Number(row.contact_masters_id) || 0;
    const msgContact = Number(msg.contact_masters_id) || 0;
    return !strayContact || !msgContact || strayContact === msgContact;
  }
  if (table === "task_message_histories") {
    const [[msg]] = await source.sequelize.query(
      "SELECT id FROM task_message_histories WHERE id = :id LIMIT 1",
      { replacements: { id: row.reference_id } }
    );
    return !!msg;
  }
  return true; // other reference tables are not verified
};

const isDuplicate = async (source, row) => {
  const [[found]] = await source.sequelize.query(
    `SELECT id FROM reminder_messages
     WHERE a_application_login_id <=> :login
       AND reference_table <=> :refTable
       AND reference_id <=> :refId
       AND remark <=> :remark
       AND reminder_data_time <=> :remindAt
     LIMIT 1`,
    {
      replacements: {
        login: row.a_application_login_id,
        refTable: row.reference_table,
        refId: row.reference_id,
        remark: row.remark,
        remindAt: row.reminder_data_time,
      },
    }
  );
  return !!found;
};

const insertCopy = async (source, row) => {
  const cols = Object.keys(row).filter((c) => c !== "id" && source.columns.has(c));
  const sql = `INSERT INTO reminder_messages (${cols.map((c) => `\`${c}\``).join(", ")})
               VALUES (${cols.map(() => "?").join(", ")})`;
  await source.sequelize.query(sql, { replacements: cols.map((c) => row[c]) });
};

const softDelete = async (dest, id) => {
  await dest.sequelize.query(
    "UPDATE reminder_messages SET isDelete = 1 WHERE id = :id AND isDelete = 0",
    { replacements: { id } }
  );
};

(async () => {
  try {
    console.log(`Tenant foreign-company reminder cleanup - ${APPLY ? "APPLY" : "DRY RUN (nothing will be written)"}`);
    console.log(`Started: ${new Date().toISOString()}`);
    if (ONLY_COMPANY) console.log(`Limited to destination company ${ONLY_COMPANY}`);

    const [tenants] = await masterSequelize.query(
      "SELECT id, company_masters_id, db_name, db_user, db_password, db_host FROM tenant_masters WHERE isDelete = 0 ORDER BY id"
    );
    const byCompany = new Map();
    tenants.forEach((t) => {
      if (byCompany.has(t.company_masters_id)) {
        console.log(`WARNING: company ${t.company_masters_id} has more than one tenant_masters row; using the first (${byCompany.get(t.company_masters_id).db_name})`);
      } else {
        byCompany.set(t.company_masters_id, t);
      }
    });
    console.log(`Found ${tenants.length} tenant(s).\n`);

    const plan = []; // { dest, row, action, reason }
    const counts = { DELETE: 0, MOVE: 0, DUPLICATE: 0, ORPHAN: 0, NO_SOURCE_DB: 0, FAILED: 0 };

    for (const destTenant of tenants) {
      if (ONLY_COMPANY && destTenant.company_masters_id !== ONLY_COMPANY) continue;
      let dest;
      try {
        dest = await getConnection(destTenant);
        const [strays] = await dest.sequelize.query(
          `SELECT * FROM reminder_messages
           WHERE company_masters_id IS NOT NULL AND company_masters_id <> :own AND isDelete = 0
           ORDER BY id`,
          { replacements: { own: destTenant.company_masters_id } }
        );
        for (const row of strays) {
          const label = `dest company ${destTenant.company_masters_id} reminder id=${row.id} -> owner company ${row.company_masters_id}`;
          let action = "FAILED";
          let reason = "";
          try {
            const sourceTenant = byCompany.get(row.company_masters_id);
            if (DELETE_ONLY) {
              action = "DELETE";
              reason = "soft-delete only (--delete-only)";
            } else if (!sourceTenant) {
              action = "NO_SOURCE_DB";
              reason = "owning company has no tenant DB";
            } else {
              const source = await getConnection(sourceTenant);
              if (!source.columns.size) {
                action = "NO_SOURCE_DB";
                reason = "owning DB has no reminder_messages table";
              } else if (await isDuplicate(source, row)) {
                action = "DUPLICATE";
                reason = "same reminder already exists in owning DB";
              } else if (!(await referenceExists(source, row))) {
                action = "ORPHAN";
                reason = `reference ${row.reference_table}#${row.reference_id} not found for this contact in owning DB`;
              } else {
                action = "MOVE";
                reason = "no copy in owning DB";
              }
            }
          } catch (e) {
            action = "FAILED";
            reason = e.message;
          }
          counts[action]++;
          plan.push({ destTenant, dest, row, action, reason, label });
          console.log(`[${action}] ${label} created=${row.create_date_time || "n/a"} ref=${row.reference_table || "(none)"}#${row.reference_id || "-"}${reason ? ` -- ${reason}` : ""}`);
        }
      } catch (e) {
        console.log(`[FAILED] dest company ${destTenant.company_masters_id} (${destTenant.db_name}) -- ${e.message}`);
      }
    }

    console.log("");
    console.log(
      `Plan: ${plan.length} stray row(s) | DELETE ${counts.DELETE} | MOVE ${counts.MOVE} | DUPLICATE ${counts.DUPLICATE} | ORPHAN ${counts.ORPHAN} | NO_SOURCE_DB ${counts.NO_SOURCE_DB} | FAILED ${counts.FAILED}`
    );

    const actionable = plan.filter(
      (p) => p.action === "DELETE" || p.action === "MOVE" || p.action === "DUPLICATE"
    );
    if (!APPLY) {
      console.log("\nDry run only. Re-run with --apply to perform the actions above.");
      return;
    }
    if (!actionable.length) {
      console.log("\nNothing to apply.");
      return;
    }

    const backupPath = path.join(process.cwd(), `reminder_cleanup_backup_${Date.now()}.json`);
    fs.writeFileSync(
      backupPath,
      JSON.stringify(
        actionable.map((p) => ({ dest_db: p.destTenant.db_name, action: p.action, row: p.row })),
        null,
        2
      ),
      "utf8"
    );
    console.log(`\nBackup of ${actionable.length} row(s) written to: ${backupPath}`);

    let moved = 0;
    let removed = 0;
    let failed = 0;
    for (const p of actionable) {
      try {
        if (p.action === "MOVE") {
          const source = await getConnection(byCompany.get(p.row.company_masters_id));
          await insertCopy(source, p.row);
          moved++;
        }
        await softDelete(p.dest, p.row.id);
        removed++;
      } catch (e) {
        failed++;
        console.log(`[APPLY FAILED] ${p.label} -- ${e.message}`);
      }
    }
    console.log(`Applied: moved ${moved} | soft-deleted ${removed} | failed ${failed}`);
    console.log("Safe to re-run: moved rows are then detected as DUPLICATE and only the soft-delete is repeated.");
  } catch (err) {
    console.error("Fatal error:", err.message || err);
    process.exitCode = 1;
  } finally {
    await closeAll();
    await masterSequelize.close?.();
    console.log(`Finished: ${new Date().toISOString()}`);
  }
})();
