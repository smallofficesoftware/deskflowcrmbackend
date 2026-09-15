// Dependency-free self-test for formBuilderDdlBuilder.js — the highest-
// risk new code in the Custom Form Maker feature (dynamic SQL), flagged in
// the plan as needing the most scrutiny. No test framework exists anywhere
// else in this codebase (verified: no jest/mocha/vitest in package.json, no
// *.test.js/*.spec.js files) — introducing one is a bigger, separately-
// scoped infra decision, not something to slip in as a side effect of this
// feature. This uses Node's built-in `assert` instead, runnable directly:
//
//   node src/services/form_builder/formBuilderDdlBuilder.test.js
//
// It is a pure module (no DB calls), so this can run standalone with no
// tenant DB connection at all — every assertion here is about the SQL
// *text* generated, not whether it executes correctly against MySQL.
import assert from "assert";
import {
  isValidFieldKey,
  isValidFormId,
  mainTableName,
  repeaterTableName,
  columnTypeForField,
  buildCreateMainTableStatement,
  buildCreateRepeaterTableStatement,
  buildAlterAddColumnsStatement,
  buildAlterModifyColumnsStatement,
} from "./formBuilderDdlBuilder.js";

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

console.log("formBuilderDdlBuilder.js self-test");

// ---- isValidFieldKey ----

test("accepts a normal snake_case key", () => {
  assert.strictEqual(isValidFieldKey("city_name"), true);
});

test("accepts a single-letter key", () => {
  assert.strictEqual(isValidFieldKey("a"), true);
});

test("rejects a key starting with a digit", () => {
  assert.strictEqual(isValidFieldKey("1city"), false);
});

test("rejects a key with uppercase letters", () => {
  assert.strictEqual(isValidFieldKey("CityName"), false);
});

test("rejects a key with a space", () => {
  assert.strictEqual(isValidFieldKey("city name"), false);
});

test("rejects a key with a semicolon (injection attempt)", () => {
  assert.strictEqual(isValidFieldKey("x`; DROP TABLE fbs_1;--"), false);
});

test("rejects a key with a backtick", () => {
  assert.strictEqual(isValidFieldKey("a`b"), false);
});

test("rejects a key longer than 63 characters", () => {
  assert.strictEqual(isValidFieldKey("a".repeat(64)), false);
});

test("accepts a key exactly 63 characters", () => {
  assert.strictEqual(isValidFieldKey("a".repeat(63)), true);
});

// Reserved-key collision — the bug caught during self-review: a field
// literally named a fixed system column would let a submitted value
// silently overwrite it.
test("rejects reserved key 'id'", () => {
  assert.strictEqual(isValidFieldKey("id"), false);
});

test("rejects reserved key 'isDelete' (exact case)", () => {
  assert.strictEqual(isValidFieldKey("isDelete"), false);
});

test("rejects reserved key 'company_masters_id'", () => {
  assert.strictEqual(isValidFieldKey("company_masters_id"), false);
});

test("rejects reserved key 'related_record_id'", () => {
  assert.strictEqual(isValidFieldKey("related_record_id"), false);
});

test("rejects reserved key 'submission_status_id'", () => {
  assert.strictEqual(isValidFieldKey("submission_status_id"), false);
});

test("rejects reserved key 'possible_duplicate_contact_id'", () => {
  assert.strictEqual(isValidFieldKey("possible_duplicate_contact_id"), false);
});

test("rejects reserved repeater-child key 'submission_id'", () => {
  assert.strictEqual(isValidFieldKey("submission_id"), false);
});

test("rejects reserved repeater-child key 'row_order'", () => {
  assert.strictEqual(isValidFieldKey("row_order"), false);
});

// ---- isValidFormId ----

test("accepts a positive integer form id", () => {
  assert.strictEqual(isValidFormId(42), true);
});

test("rejects zero", () => {
  assert.strictEqual(isValidFormId(0), false);
});

test("rejects a negative number", () => {
  assert.strictEqual(isValidFormId(-1), false);
});

test("rejects a non-integer", () => {
  assert.strictEqual(isValidFormId(1.5), false);
});

test("rejects a string that looks numeric (must be a real number, not client text)", () => {
  assert.strictEqual(isValidFormId("42"), false);
});

// ---- table naming ----

test("mainTableName produces fbs_<id>", () => {
  assert.strictEqual(mainTableName(42), "fbs_42");
});

test("mainTableName throws on an invalid id", () => {
  assert.throws(() => mainTableName("42; DROP TABLE users"), /invalid form id/);
});

test("repeaterTableName produces fbs_<id>_r<repeaterFieldId>", () => {
  assert.strictEqual(repeaterTableName(42, 7), "fbs_42_r7");
});

test("repeaterTableName stays short enough for MySQL's 64-char identifier limit even with large ids", () => {
  const name = repeaterTableName(999999, 999999);
  assert.ok(name.length <= 64, `expected <=64 chars, got ${name.length}: ${name}`);
});

// ---- column type mapping ----

test("maps text to VARCHAR(255)", () => {
  assert.strictEqual(columnTypeForField({ type: "text" }), "VARCHAR(255)");
});

test("maps textarea to TEXT", () => {
  assert.strictEqual(columnTypeForField({ type: "textarea" }), "TEXT");
});

test("maps number to DECIMAL(18,4)", () => {
  assert.strictEqual(columnTypeForField({ type: "number" }), "DECIMAL(18,4)");
});

test("maps rating to DECIMAL(18,4), not stuffed into VARCHAR (earlier draft bug)", () => {
  assert.strictEqual(columnTypeForField({ type: "rating" }), "DECIMAL(18,4)");
});

test("maps reference to INT", () => {
  assert.strictEqual(columnTypeForField({ type: "reference" }), "INT");
});

test("throws for a type with no column mapping (e.g. a layout-only type passed by mistake)", () => {
  assert.throws(() => columnTypeForField({ type: "section-header" }), /no column mapping/);
});

// ---- CREATE TABLE generation ----

test("buildCreateMainTableStatement includes every fixed column", () => {
  const sql = buildCreateMainTableStatement(1, []);
  for (const col of [
    "id",
    "company_masters_id",
    "related_record_id",
    "possible_duplicate_contact_id",
    "submission_status_id",
    "isDelete",
    "isActive",
  ]) {
    assert.ok(sql.includes(`\`${col}\``), `expected fixed column ${col} in CREATE TABLE`);
  }
});

test("buildCreateMainTableStatement adds a column per scalar field", () => {
  const sql = buildCreateMainTableStatement(1, [{ key: "city", type: "text" }]);
  assert.ok(sql.includes("`city` VARCHAR(255) NULL"), sql);
});

test("buildCreateMainTableStatement skips layout/no-column field types", () => {
  const sql = buildCreateMainTableStatement(1, [
    { key: "heading", type: "section-header" },
    { key: "attachment", type: "file" },
    { key: "line_items", type: "repeater", columns: [] },
  ]);
  assert.ok(!sql.includes("`heading`"));
  assert.ok(!sql.includes("`attachment`"));
  assert.ok(!sql.includes("`line_items`"));
});

test("buildCreateMainTableStatement adds a plain INDEX for a filterable field", () => {
  const sql = buildCreateMainTableStatement(1, [{ key: "city", type: "text", filterable: true }]);
  assert.ok(sql.includes("INDEX `idx_city` (`city`)"), sql);
});

test("buildCreateMainTableStatement adds a UNIQUE INDEX for a unique field, not a plain INDEX too", () => {
  const sql = buildCreateMainTableStatement(1, [{ key: "email", type: "email", unique: true, filterable: true }]);
  assert.ok(sql.includes("UNIQUE INDEX `uniq_email` (`email`)"), sql);
  assert.ok(!sql.includes("INDEX `idx_email`"), "should not also get a plain filterable index");
});

test("buildCreateMainTableStatement throws (not silently drops) a reserved-word field key", () => {
  assert.throws(() => buildCreateMainTableStatement(1, [{ key: "isDelete", type: "text" }]), /VALIDATION:/);
});

test("buildCreateMainTableStatement throws on a SQL-injection-shaped field key", () => {
  assert.throws(
    () => buildCreateMainTableStatement(1, [{ key: "x`; DROP TABLE fbs_1;--", type: "text" }]),
    /VALIDATION:/,
  );
});

// ---- repeater child table ----

test("buildCreateRepeaterTableStatement includes submission_id and row_order fixed columns", () => {
  const sql = buildCreateRepeaterTableStatement(1, 5, [{ key: "item_name", type: "text" }]);
  assert.ok(sql.includes("`submission_id` INT NOT NULL"), sql);
  assert.ok(sql.includes("`row_order` INT NOT NULL"), sql);
  assert.ok(sql.includes("`item_name` VARCHAR(255) NULL"), sql);
});

// ---- ALTER TABLE generation ----

test("buildAlterAddColumnsStatement returns null when there is nothing to add", () => {
  assert.strictEqual(buildAlterAddColumnsStatement("fbs_1", []), null);
});

test("buildAlterAddColumnsStatement batches multiple new columns into ONE statement", () => {
  const sql = buildAlterAddColumnsStatement("fbs_1", [
    { key: "a", type: "text" },
    { key: "b", type: "number" },
  ]);
  const alterCount = (sql.match(/ALTER TABLE/g) || []).length;
  assert.strictEqual(alterCount, 1, "expected exactly one ALTER TABLE statement, not one per column");
  assert.ok(sql.includes("ADD COLUMN `a`"));
  assert.ok(sql.includes("ADD COLUMN `b`"));
});

test("buildAlterAddColumnsStatement adds ADD INDEX in the SAME statement as the column, not a follow-up one", () => {
  const sql = buildAlterAddColumnsStatement("fbs_1", [{ key: "city", type: "text", filterable: true }]);
  assert.ok(sql.includes("ADD COLUMN `city`"));
  assert.ok(sql.includes("ADD INDEX `idx_city`"));
  assert.strictEqual((sql.match(/ALTER TABLE/g) || []).length, 1);
});

test("buildAlterModifyColumnsStatement returns null when nothing changed", () => {
  assert.strictEqual(buildAlterModifyColumnsStatement("fbs_1", []), null);
});

test("buildAlterModifyColumnsStatement generates MODIFY COLUMN, not ADD COLUMN", () => {
  const sql = buildAlterModifyColumnsStatement("fbs_1", [{ key: "qty", type: "number" }]);
  assert.ok(sql.includes("MODIFY COLUMN `qty`"), sql);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
