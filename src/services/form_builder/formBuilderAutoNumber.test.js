// Dependency-free self-test for formBuilderAutoNumber.js — same style as
// formBuilderFormatPresets.test.js (Node's built-in assert, no framework).
// Runnable directly:
//
//   node src/services/form_builder/formBuilderAutoNumber.test.js
//
// assignAutoNumber is exercised against a fake tenantDB that keeps the
// counter rows in memory — no real DB query is made.
import assert from "assert";
import {
  normalizeAutoNumberConfig,
  validateAutoNumberConfig,
  periodKeyFor,
  seriesKeyFor,
  prefixForSeries,
  formatAutoNumber,
  previewAutoNumber,
  numberingDateFor,
  assignAutoNumber,
  validateManualAutoNumber,
} from "./formBuilderAutoNumber.js";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${e.message}`);
  }
}

const field = (auto_number, extra = {}) => ({ key: "form_no", label: "Form No", type: "auto-number", auto_number, ...extra });
const JUNE_2026 = new Date("2026-06-15T10:00:00+05:30");
const FEB_2027 = new Date("2027-02-10T10:00:00+05:30");

// Fake tenantDB: understands the three statements assignAutoNumber issues.
function fakeDb({ failFirstInsertWithDuplicate = false } = {}) {
  const rows = [];
  let nextId = 1;
  let duplicateThrown = false;
  return {
    rows,
    async query(sql, { replacements, transaction }) {
      assert.ok(transaction, "query must carry the transaction");
      if (sql.trim().startsWith("SELECT")) {
        return rows
          .filter((r) => r.form_id === replacements.form_id && r.field_key === replacements.field_key
            && r.series_key === replacements.series_key && r.period_key === replacements.period_key)
          .map((r) => ({ id: r.id, last_number: r.last_number }));
      }
      if (sql.trim().startsWith("UPDATE")) {
        rows.find((r) => r.id === replacements.id).last_number = replacements.seq;
        return [];
      }
      if (sql.trim().startsWith("INSERT")) {
        if (failFirstInsertWithDuplicate && !duplicateThrown) {
          duplicateThrown = true;
          // Simulate a parallel save that inserted the row first.
          rows.push({ id: nextId++, ...pick(replacements), last_number: replacements.seq });
          throw Object.assign(new Error("dup"), { original: { code: "ER_DUP_ENTRY" } });
        }
        rows.push({ id: nextId++, ...pick(replacements), last_number: replacements.seq });
        return [];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}
const pick = ({ form_id, field_key, series_key, period_key }) => ({ form_id, field_key, series_key, period_key });

console.log("formBuilderAutoNumber.js self-test");

await test("normalize: defaults", () => {
  const c = normalizeAutoNumberConfig(undefined);
  assert.strictEqual(c.format, "{PREFIX}{SEQ}");
  assert.strictEqual(c.start, 1);
  assert.strictEqual(c.padding, 4);
  assert.strictEqual(c.reset, "never");
});

await test("normalize: bad start/padding fall back, padding capped at 10", () => {
  const c = normalizeAutoNumberConfig({ start: -3, padding: 50 });
  assert.strictEqual(c.start, 1);
  assert.strictEqual(c.padding, 10);
});

await test("format: ENV/{FY}/{SEQ} in June 2026", () => {
  assert.strictEqual(formatAutoNumber({ prefix: "ENV", format: "{PREFIX}/{FY}/{SEQ}" }, { seq: 207, date: JUNE_2026 }), "ENV/2026-2027/0207");
});

await test("format: {FYS} short financial year, Feb 2027 is still FY 26-27", () => {
  assert.strictEqual(formatAutoNumber({ prefix: "ENV", format: "{PREFIX}/{FYS}/{SEQ}", padding: 3 }, { seq: 5, date: FEB_2027 }), "ENV/26-27/005");
});

await test("format: {YYYY}{MM}", () => {
  assert.strictEqual(formatAutoNumber({ format: "QC-{YYYY}{MM}-{SEQ}", padding: 2 }, { seq: 1, date: JUNE_2026 }), "QC-202606-01");
});

await test("preview uses the start number", () => {
  assert.strictEqual(previewAutoNumber({ prefix: "S", format: "{PREFIX}{SEQ}", start: 100, padding: 5 }, { date: JUNE_2026 }), "S00100");
});

await test("period keys", () => {
  assert.strictEqual(periodKeyFor("never", JUNE_2026), "all");
  assert.strictEqual(periodKeyFor("fy", FEB_2027), "2026-2027");
  assert.strictEqual(periodKeyFor("year", FEB_2027), "2027");
  assert.strictEqual(periodKeyFor("month", JUNE_2026), "2026-06");
});

await test("series key from the chosen field; empty when not configured", () => {
  assert.strictEqual(seriesKeyFor({ series_by: "division" }, { division: " Food " }), "Food");
  assert.strictEqual(seriesKeyFor({}, { division: "Food" }), "");
  assert.strictEqual(seriesKeyFor({ series_by: "division" }, {}), "");
});

await test("prefix per series: mapped, else the value itself, else field prefix", () => {
  const c = { prefix: "ENV", series_by: "division", series_prefixes: { Food: "FD" } };
  assert.strictEqual(prefixForSeries(c, "Food"), "FD");
  assert.strictEqual(prefixForSeries(c, "Soil Testing"), "SOILTESTING");
  assert.strictEqual(prefixForSeries(c, ""), "ENV");
});

await test("numbering date: configured date field, else now", () => {
  const c = { date_field: "entry_date" };
  assert.strictEqual(numberingDateFor(c, { entry_date: "2025-01-05" }).getFullYear(), 2025);
  assert.ok(Math.abs(numberingDateFor(c, {}).getTime() - Date.now()) < 5000);
});

await test("validate: valid config passes", () => {
  assert.strictEqual(validateAutoNumberConfig(field({ prefix: "ENV", format: "{PREFIX}/{FY}/{SEQ}", reset: "fy" })), null);
});

await test("validate: {SEQ} required", () => {
  assert.match(validateAutoNumberConfig(field({ format: "{PREFIX}" })), /must include \{SEQ\}/);
});

await test("validate: unknown token named", () => {
  assert.match(validateAutoNumberConfig(field({ format: "{PREFIX}{DAY}{SEQ}" })), /\{DAY\}/);
});

await test("validate: yearly reset without a year token is rejected", () => {
  assert.match(validateAutoNumberConfig(field({ format: "{SEQ}", reset: "fy" })), /would repeat/);
  assert.match(validateAutoNumberConfig(field({ format: "{YYYY}{SEQ}", reset: "month" })), /\{MM\}/);
  assert.strictEqual(validateAutoNumberConfig(field({ format: "{YY}{MM}{SEQ}", reset: "month" })), null);
});

await test("validate: unknown reset value", () => {
  assert.match(validateAutoNumberConfig(field({ reset: "weekly" })), /start again/);
});

await test("validate: series_by must exist and needs {PREFIX}", () => {
  const fields = [{ key: "division", label: "Division", type: "dropdown" }];
  assert.match(validateAutoNumberConfig(field({ series_by: "missing" }), fields), /no longer exists/);
  assert.match(validateAutoNumberConfig(field({ series_by: "division", format: "{SEQ}" }), fields), /\{PREFIX\}/);
  assert.strictEqual(validateAutoNumberConfig(field({ series_by: "division", format: "{PREFIX}{SEQ}" }), fields), null);
});

await test("validate: duplicate series prefixes rejected", () => {
  const fields = [{ key: "division", label: "Division", type: "dropdown" }];
  const f = field({ series_by: "division", format: "{PREFIX}{SEQ}", series_prefixes: { A: "x", B: "X" } });
  assert.match(validateAutoNumberConfig(f, fields), /same prefix/);
});

await test("validate: date_field must be a date field", () => {
  const fields = [{ key: "entry_date", type: "date" }, { key: "name", type: "text" }];
  assert.strictEqual(validateAutoNumberConfig(field({ date_field: "entry_date" }), fields), null);
  assert.match(validateAutoNumberConfig(field({ date_field: "name" }), fields), /date field/);
});

await test("validate: too-long format rejected", () => {
  assert.match(validateAutoNumberConfig(field({ prefix: "P".repeat(95), format: "{PREFIX}{SEQ}" })), /too long/);
});

await test("validate: message uses the label", () => {
  assert.match(validateAutoNumberConfig(field({ format: "x" })), /“Form No”/);
});

await test("assign: needs a transaction", async () => {
  await assert.rejects(() => assignAutoNumber({ tenantDB: fakeDb(), field: field({}), answers: {} }), /transaction/);
});

await test("assign: first number is start, then increments", async () => {
  const db = fakeDb();
  const f = field({ prefix: "ENV", format: "{PREFIX}-{SEQ}", start: 207, padding: 3 });
  const args = { tenantDB: db, transaction: {}, company_masters_id: 1, form_id: 9, field: f, answers: {} };
  assert.strictEqual(await assignAutoNumber(args), "ENV-207");
  assert.strictEqual(await assignAutoNumber(args), "ENV-208");
  assert.strictEqual(db.rows.length, 1);
});

await test("assign: separate counters per series", async () => {
  const db = fakeDb();
  const f = field({ format: "{PREFIX}{SEQ}", padding: 1, series_by: "division", series_prefixes: { Food: "FD" } });
  const base = { tenantDB: db, transaction: {}, company_masters_id: 1, form_id: 9, field: f };
  assert.strictEqual(await assignAutoNumber({ ...base, answers: { division: "Food" } }), "FD1");
  assert.strictEqual(await assignAutoNumber({ ...base, answers: { division: "Water" } }), "WATER1");
  assert.strictEqual(await assignAutoNumber({ ...base, answers: { division: "Food" } }), "FD2");
});

await test("assign: period from date field resets per financial year", async () => {
  const db = fakeDb();
  const f = field({ format: "{FYS}/{SEQ}", padding: 1, reset: "fy", date_field: "d" });
  const base = { tenantDB: db, transaction: {}, company_masters_id: 1, form_id: 9, field: f };
  assert.strictEqual(await assignAutoNumber({ ...base, answers: { d: "2026-03-31" } }), "25-26/1");
  assert.strictEqual(await assignAutoNumber({ ...base, answers: { d: "2026-04-01" } }), "26-27/1");
  assert.strictEqual(await assignAutoNumber({ ...base, answers: { d: "2026-05-01" } }), "26-27/2");
});

await test("assign: start raised later is respected", async () => {
  const db = fakeDb();
  const base = { tenantDB: db, transaction: {}, company_masters_id: 1, form_id: 9, answers: {} };
  await assignAutoNumber({ ...base, field: field({ format: "{SEQ}", padding: 1 }) });
  assert.strictEqual(await assignAutoNumber({ ...base, field: field({ format: "{SEQ}", padding: 1, start: 500 }) }), "500");
});

await test("assign: parallel first insert retries and takes the next number", async () => {
  const db = fakeDb({ failFirstInsertWithDuplicate: true });
  const f = field({ format: "{SEQ}", padding: 1 });
  assert.strictEqual(await assignAutoNumber({ tenantDB: db, transaction: {}, company_masters_id: 1, form_id: 9, field: f, answers: {} }), "2");
});

await test("manual number: trimmed, required, length-limited", () => {
  assert.deepStrictEqual(validateManualAutoNumber(field({}), "  ENV/1  "), { value: "ENV/1" });
  assert.ok(validateManualAutoNumber(field({}), "").error);
  assert.ok(validateManualAutoNumber(field({}), "x".repeat(101)).error);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
