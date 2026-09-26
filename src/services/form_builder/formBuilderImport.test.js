import assert from "node:assert/strict";
import { coerceImportCell, importColumns, importableFields, parseDateCell, rowToAnswers } from "./formBuilderImport.js";

let passed = 0;
const t = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const f = (type, extra = {}) => ({ key: "k", label: "Field", type, ...extra });

t("only cell-friendly types are importable", () => {
  const fields = [f("text", { key: "a" }), f("repeater", { key: "b" }), f("file", { key: "c" }), f("calculation", { key: "d" }), f("date", { key: "e" }), { label: "no key", type: "text" }];
  assert.deepEqual(importableFields(fields).map((x) => x.key), ["a", "e"]);
});

t("auto number column only with the override right; duplicate labels get the key", () => {
  const fields = [f("text", { key: "a", label: "Name" }), f("text", { key: "b", label: "name" }), f("auto-number", { key: "n", label: "No" })];
  assert.deepEqual(importColumns(fields).map((c) => c.header), ["Name (a)", "name (b)"]);
  assert.equal(importColumns(fields, { canOverrideAutoNumber: true }).length, 3);
});

t("dates: many layouts, Excel serials, bad dates", () => {
  assert.deepEqual(coerceImportCell(f("date"), "25-12-2026"), { value: "2026-12-25" });
  assert.deepEqual(coerceImportCell(f("date"), "5/1/2026"), { value: "2026-01-05" });
  assert.deepEqual(coerceImportCell(f("date"), "2026-03-09"), { value: "2026-03-09" });
  assert.deepEqual(coerceImportCell(f("date"), 45658), { value: "2025-01-01" });
  assert.equal(parseDateCell(45658).y, 2025);
  assert.ok(coerceImportCell(f("date"), "31-02-2026").error);
  assert.ok(coerceImportCell(f("date"), "soon").error);
});

t("datetime and time", () => {
  assert.deepEqual(coerceImportCell(f("datetime"), "25-12-2026 14:30"), { value: "2026-12-25T14:30:00+05:30" });
  assert.deepEqual(coerceImportCell(f("datetime"), "25-12-2026"), { value: "2026-12-25T00:00:00+05:30" });
  assert.deepEqual(coerceImportCell(f("time"), "2:05 pm"), { value: "14:05" });
  assert.deepEqual(coerceImportCell(f("time"), 0.5), { value: "12:00" });
  assert.ok(coerceImportCell(f("time"), "25:00").error);
});

t("numbers strip commas, rupee sign and percent", () => {
  assert.deepEqual(coerceImportCell(f("currency"), "₹ 1,25,000.50"), { value: 125000.5 });
  assert.deepEqual(coerceImportCell(f("percentage"), "12%"), { value: 12 });
  assert.deepEqual(coerceImportCell(f("number"), 7), { value: 7 });
  assert.ok(coerceImportCell(f("number"), "abc").error);
});

t("yes/no fields", () => {
  assert.deepEqual(coerceImportCell(f("checkbox"), "Yes"), { value: true });
  assert.deepEqual(coerceImportCell(f("switch"), "no"), { value: false });
  assert.ok(coerceImportCell(f("checkbox"), "maybe").error);
});

t("dropdown / multi-select match options ignoring case", () => {
  const dd = f("dropdown", { options: ["Hot", "Warm", "Cold"] });
  assert.deepEqual(coerceImportCell(dd, " warm "), { value: "Warm" });
  assert.ok(/not one of Hot, Warm, Cold/.test(coerceImportCell(dd, "Lukewarm").error));
  const ms = f("multi-select", { options: ["A", "B", "C"] });
  assert.deepEqual(coerceImportCell(ms, "a, c; A"), { value: ["A", "C"] });
  assert.ok(coerceImportCell(ms, "A, Z").error);
});

t("empty cell leaves the field unanswered", () => {
  assert.deepEqual(coerceImportCell(f("text"), "  "), { value: undefined });
  assert.deepEqual(coerceImportCell(f("number"), null), { value: undefined });
});

t("rowToAnswers collects answers and every cell problem", () => {
  const cols = [f("text", { key: "name", label: "Name" }), f("number", { key: "age", label: "Age" }), f("date", { key: "dob", label: "DOB" })];
  const ok = rowToAnswers(cols, { name: "Ravi", age: "31", dob: "01-02-1995", extra: "ignored" });
  assert.deepEqual(ok, { answers: { name: "Ravi", age: 31, dob: "1995-02-01" }, errors: [] });
  const bad = rowToAnswers(cols, { name: "", age: "x", dob: "zz" });
  assert.equal(bad.errors.length, 2);
  assert.deepEqual(bad.answers, {});
});

console.log(`\n${passed} passed`);
