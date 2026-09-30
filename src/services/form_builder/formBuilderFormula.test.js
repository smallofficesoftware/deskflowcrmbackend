// Dependency-free self-test for formBuilderFormula.js — runs every case in
// formBuilderFormula.fixtures.json (the frontend copies that file verbatim
// and runs the same cases), then a few extra checks. Runnable directly:
//
//   node src/services/form_builder/formBuilderFormula.test.js
import assert from "assert";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { evaluateFormula, roundResult, findFormulaProblem, parseFormula, dayNumberFromString, dayNumberToString, FORMULA_FUNCTIONS } from "./formBuilderFormula.js";

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

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, "formBuilderFormula.fixtures.json"), "utf8"));

// How a fixture is run — the frontend runner must do exactly the same.
function runFixture(fx) {
  return evaluateFormula(fx.formula, { resolve: (name) => fx.values[name] ?? null, today: fx.today });
}

console.log("formBuilderFormula.js self-test");
console.log("fixtures:");
for (const fx of fixtures) {
  test(fx.name, () => {
    const result = runFixture(fx);
    assert.strictEqual(result.kind, fx.expected.kind, `kind (error: ${result.error})`);
    assert.strictEqual(result.value, fx.expected.value, "value");
    if (fx.expected.error) assert.ok((result.error || "").includes(fx.expected.error), `error "${result.error}" should include "${fx.expected.error}"`);
    else assert.strictEqual(result.error, undefined, `unexpected error: ${result.error}`);
  });
}

test("fixture names are unique", () => {
  assert.strictEqual(new Set(fixtures.map((f) => f.name)).size, fixtures.length);
});

test("parseFormula lists the references (lower-cased, no duplicates)", () => {
  assert.deepStrictEqual(parseFormula("[Qty] * [rate] + [qty] + SUM([items.amount])").refs.sort(), ["items.amount", "qty", "rate"]);
});

test("findFormulaProblem: unknown reference named", () => {
  assert.match(findFormulaProblem("[qty] * [gone]", new Set(["qty"])), /\[gone\]/);
  assert.strictEqual(findFormulaProblem("[qty] * 2", new Set(["qty"])), null);
  assert.strictEqual(findFormulaProblem("[qty] * 2"), null);
});

test("findFormulaProblem: syntax problems are plain words", () => {
  assert.match(findFormulaProblem("[qty] *"), /ends too early/);
  assert.match(findFormulaProblem("SUM(1,"), /ends too early|Unexpected/);
  assert.match(findFormulaProblem("x"), /isn't a function|must be followed/);
});

test("formula length is limited", () => {
  assert.match(findFormulaProblem("1+".repeat(300) + "1"), /too long/);
});

test("deep nesting is stopped", () => {
  assert.match(findFormulaProblem("(".repeat(60) + "1" + ")".repeat(60)), /nested too deeply/);
});

test("roundResult rounds numbers and leaves dates / empty alone", () => {
  assert.deepStrictEqual(roundResult({ value: 1.005, kind: "number" }, 2), { value: 1.01, kind: "number" });
  assert.deepStrictEqual(roundResult({ value: 2.5, kind: "number" }, 0), { value: 3, kind: "number" });
  assert.deepStrictEqual(roundResult({ value: "2026-01-01", kind: "date" }, 2), { value: "2026-01-01", kind: "date" });
  assert.deepStrictEqual(roundResult({ value: null, kind: null }, 2), { value: null, kind: null });
});

test("day numbers round-trip and reject impossible dates", () => {
  assert.strictEqual(dayNumberToString(dayNumberFromString("2026-09-26")), "2026-09-26");
  assert.strictEqual(dayNumberFromString("2026-02-30"), null);
  assert.strictEqual(dayNumberFromString("not a date"), null);
  assert.strictEqual(dayNumberFromString("2026-09-26T10:00:00"), dayNumberFromString("2026-09-26"));
});

test("function list is what the docs say", () => {
  assert.deepStrictEqual([...FORMULA_FUNCTIONS].sort(), ["ABS", "ADD_DAYS", "AGE_YEARS", "AVG", "COUNT", "DAYS_BETWEEN", "IF", "MAX", "MIN", "ROUND", "SUM", "TODAY"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
