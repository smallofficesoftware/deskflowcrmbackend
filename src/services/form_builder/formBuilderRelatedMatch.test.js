// Dependency-free self-test for formBuilderRelatedMatch.js. Runnable directly:
//
//   node src/services/form_builder/formBuilderRelatedMatch.test.js
import assert from "assert";
import { buildRelatedMatch, relatedMatchModules } from "./formBuilderRelatedMatch.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${e.message}`);
  }
}

console.log("formBuilderRelatedMatch.js self-test");

test("visit / expense / work match by id only", () => {
  for (const m of ["visit", "expense", "task", "support_ticket", "job_card", "inquiry"]) {
    const b = buildRelatedMatch(m, "42", 7);
    assert.ok(b.sql.includes("`id` = :idValue"), m);
    assert.strictEqual(b.replacements.idValue, 42);
    assert.strictEqual(b.replacements.company_masters_id, 7);
    assert.ok(!b.sql.includes(":value"), m);
  }
  assert.strictEqual(buildRelatedMatch("visit", "abc", 7), null);
});

test("sales / purchase / stock match by id or number, scoped to their cart type", () => {
  const q = buildRelatedMatch("quotation", "QT-101", 7);
  assert.ok(q.sql.includes("`cart_number` = :value"));
  assert.ok(!q.sql.includes("`id` = :idValue"));
  assert.ok(q.sql.includes("type = 1"));
  const byId = buildRelatedMatch("sales_invoice", "55", 7);
  assert.ok(byId.sql.includes("`id` = :idValue") && byId.sql.includes("`cart_number` = :value"));
  assert.ok(byId.sql.includes("type = 3"));
});

test("support tickets and tasks stay apart", () => {
  assert.ok(buildRelatedMatch("task", "1", 7).sql.includes("is_support_ticket = 0"));
  assert.ok(buildRelatedMatch("support_ticket", "1", 7).sql.includes("is_support_ticket = 1"));
});

test("product matches by product code, work order by id or job number", () => {
  const p = buildRelatedMatch("product", "SKU-9", 7);
  assert.ok(p.sql.includes("`product_code` = :value") && !p.sql.includes("`id`"));
  const w = buildRelatedMatch("work_order", "JOB-3", 7);
  assert.ok(w.sql.includes("`job_id` = :value") && !w.sql.includes(":idValue"));
});

test("contact, unknown modules, blank and over-long values are not matched here", () => {
  assert.strictEqual(buildRelatedMatch("contact", "9876543210", 7), null);
  assert.strictEqual(buildRelatedMatch("nope", "1", 7), null);
  assert.strictEqual(buildRelatedMatch("visit", "  ", 7), null);
  assert.strictEqual(buildRelatedMatch("product", "x".repeat(101), 7), null);
  assert.ok(!relatedMatchModules().includes("contact"));
});

test("values never reach the SQL text", () => {
  const b = buildRelatedMatch("quotation", "1' OR '1'='1", 7);
  assert.ok(!b.sql.includes("OR '1'"));
  assert.strictEqual(b.replacements.value, "1' OR '1'='1");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
