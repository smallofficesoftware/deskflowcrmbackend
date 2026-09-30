// Dependency-free self-test for formBuilderCalculations.js. Runnable directly:
//
//   node src/services/form_builder/formBuilderCalculations.test.js
import assert from "assert";
import { evaluateVisibility } from "./formBuilderConditions.js";
import { applyCalculations, findCalculationProblems, orderCalculations, resultLabelFor, decimalsOf, resultTypeOf } from "./formBuilderCalculations.js";

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

const NOW = new Date("2026-09-26T10:00:00+05:30");

// Runs applyCalculations the way the submission service does.
function run(fields, answers, { columns = {}, repeaterRowSets = {}, questionStats = {} } = {}) {
  const visible = evaluateVisibility(fields, answers);
  applyCalculations({ fields, answers, visible, columns, repeaterRowSets, questionStats, now: NOW });
  return { columns, repeaterRowSets };
}

console.log("formBuilderCalculations.js self-test");

test("simple top-level calculation, rounded to the field's decimals", () => {
  const fields = [
    { key: "qty", type: "number" },
    { key: "rate", type: "number" },
    { key: "total", type: "calculation", formula: "[qty] * [rate]", decimals: 1 },
  ];
  const { columns } = run(fields, {}, { columns: { qty: 3, rate: 2.55 } });
  assert.strictEqual(columns.total, 7.7);
});

test("default is 2 decimals; empty fields count as zero", () => {
  const fields = [{ key: "a", type: "number" }, { key: "t", type: "calculation", formula: "[a] / 3 + 1" }];
  assert.strictEqual(run(fields, {}, { columns: { a: 1 } }).columns.t, 1.33);
  assert.strictEqual(run(fields, {}, { columns: {} }).columns.t, 1);
});

test("calculations can use other calculations, whatever their order on the form", () => {
  const fields = [
    { key: "grand", type: "calculation", formula: "[net] + [tax]" },
    { key: "tax", type: "calculation", formula: "[net] * 0.18" },
    { key: "net", type: "calculation", formula: "[a] * 2" },
    { key: "a", type: "number" },
  ];
  const { columns } = run(fields, {}, { columns: { a: 100 } });
  assert.deepStrictEqual([columns.net, columns.tax, columns.grand], [200, 36, 236]);
});

test("division by zero leaves the result empty", () => {
  const fields = [{ key: "a", type: "number" }, { key: "t", type: "calculation", formula: "10 / [a]" }];
  assert.strictEqual(run(fields, {}, { columns: { a: 0 } }).columns.t, null);
});

test("a hidden calculation is stored empty", () => {
  const fields = [
    { key: "show", type: "checkbox" },
    { key: "t", type: "calculation", formula: "5", conditions: { rules: [{ field: "show", op: "is", value: 1 }] } },
  ];
  assert.strictEqual(run(fields, { show: 0 }, { columns: { show: 0 } }).columns.t, null);
  assert.strictEqual(run(fields, { show: 1 }, { columns: { show: 1 } }).columns.t, 5);
});

test("date result: received + 7 days, from the typed date (no time-zone shift)", () => {
  const fields = [
    { key: "received", type: "date" },
    { key: "due", type: "calculation", result_type: "date", formula: "ADD_DAYS([received], 7)" },
  ];
  const { columns } = run(fields, { received: "2026-03-28" }, { columns: { received: new Date("2026-03-28") } });
  assert.strictEqual(columns.due, "2026-04-04");
});

test("date result from a datetime answer uses the typed day", () => {
  const fields = [
    { key: "at", type: "datetime" },
    { key: "due", type: "calculation", result_type: "date", formula: "ADD_DAYS([at], 1)" },
  ];
  const { columns } = run(fields, { at: "2026-03-28T23:30" }, { columns: { at: new Date("2026-03-28T23:30:00+05:30") } });
  assert.strictEqual(columns.due, "2026-03-29");
});

test("date filled by the server (default today) still works as a source", () => {
  const fields = [
    { key: "d", type: "date" },
    { key: "due", type: "calculation", result_type: "date", formula: "ADD_DAYS([d], 2)" },
  ];
  assert.strictEqual(run(fields, {}, { columns: { d: "2026-09-26" } }).columns.due, "2026-09-28");
});

test("a number formula on a date-result field (or the reverse) stays empty", () => {
  const fields = [{ key: "a", type: "number" }, { key: "t", type: "calculation", result_type: "date", formula: "[a] + 1" }];
  assert.strictEqual(run(fields, {}, { columns: { a: 1 } }).columns.t, null);
});

test("age uses today in the +05:30 zone", () => {
  const fields = [{ key: "dob", type: "date" }, { key: "age", type: "calculation", decimals: 0, formula: "AGE_YEARS([dob])" }];
  assert.strictEqual(run(fields, { dob: "1990-09-26" }, { columns: { dob: "1990-09-26" } }).columns.age, 36);
  assert.strictEqual(run(fields, { dob: "1990-09-27" }, { columns: { dob: "1990-09-27" } }).columns.age, 35);
});

test("repeater: per-row amount and a total over the rows", () => {
  const fields = [
    {
      key: "items",
      type: "repeater",
      columns: [
        { key: "qty", type: "number" },
        { key: "rate", type: "number" },
        { key: "amount", type: "calculation", formula: "[qty] * [rate]" },
      ],
    },
    { key: "total", type: "calculation", formula: "SUM([items.amount])" },
  ];
  const repeaterRowSets = { items: [{ qty: 2, rate: 10 }, { qty: 1, rate: 5.5 }, { qty: null, rate: 3 }] };
  const { columns, repeaterRowSets: rows } = run(fields, { items: [{}, {}, {}] }, { repeaterRowSets });
  assert.deepStrictEqual(rows.items.map((r) => r.amount), [20, 5.5, 0]);
  assert.strictEqual(columns.total, 25.5);
});

test("repeater row calculation can use a top-level value (tax %)", () => {
  const fields = [
    { key: "tax", type: "number" },
    { key: "items", type: "repeater", columns: [{ key: "net", type: "number" }, { key: "gross", type: "calculation", formula: "[net] * (1 + [tax] / 100)" }] },
  ];
  const { repeaterRowSets: rows } = run(fields, { items: [{}] }, { columns: { tax: 18 }, repeaterRowSets: { items: [{ net: 100 }] } });
  assert.strictEqual(rows.items[0].gross, 118);
});

test("a total that uses a calculation which itself waits for the rows works in the right order", () => {
  const fields = [
    { key: "items", type: "repeater", columns: [{ key: "qty", type: "number" }, { key: "amount", type: "calculation", formula: "[qty] * 10" }] },
    { key: "sub", type: "calculation", formula: "SUM([items.amount])" },
    { key: "grand", type: "calculation", formula: "[sub] * 2" },
  ];
  const { columns } = run(fields, { items: [{}, {}] }, { repeaterRowSets: { items: [{ qty: 1 }, { qty: 2 }] } });
  assert.deepStrictEqual([columns.sub, columns.grand], [30, 60]);
});

test("question table score in a calculation", () => {
  const fields = [
    { key: "checks", type: "question-table" },
    { key: "pct", type: "calculation", decimals: 0, formula: "IF([checks.max_score] = 0, 0, [checks.score] / [checks.max_score] * 100)" },
  ];
  assert.strictEqual(run(fields, {}, { questionStats: { checks: { score: 3, max_score: 4, answered: 4 } } }).columns.pct, 75);
  assert.strictEqual(run(fields, {}, {}).columns.pct, 0);
});

test("result labels from ranges", () => {
  const f = { result_ranges: [{ from: 80, label: "Grade A" }, { from: 0, label: "Fail" }, { from: 50, label: "Pass" }] };
  assert.strictEqual(resultLabelFor(f, 95), "Grade A");
  assert.strictEqual(resultLabelFor(f, 50), "Pass");
  assert.strictEqual(resultLabelFor(f, 10), "Fail");
  assert.strictEqual(resultLabelFor(f, -1), null);
  assert.strictEqual(resultLabelFor(f, null), null);
  assert.strictEqual(resultLabelFor({}, 5), null);
});

test("decimals and result type defaults", () => {
  assert.strictEqual(decimalsOf({}), 2);
  assert.strictEqual(decimalsOf({ decimals: 0 }), 0);
  assert.strictEqual(decimalsOf({ decimals: 9 }), 2);
  assert.strictEqual(resultTypeOf({}), "number");
  assert.strictEqual(resultTypeOf({ result_type: "date" }), "date");
});

test("ordering finds cycles", () => {
  const a = { key: "a", type: "calculation", formula: "[b] + 1" };
  const b = { key: "b", type: "calculation", formula: "[a] + 1" };
  assert.strictEqual(orderCalculations([a, b]).cycle.length, 2);
  const c = { key: "c", type: "calculation", formula: "[c] + 1" };
  assert.strictEqual(orderCalculations([c]).cycle.length, 1);
});

test("publish check: valid form passes", () => {
  const fields = [
    { key: "qty", type: "number" },
    { key: "items", type: "repeater", columns: [{ key: "q", type: "number" }, { key: "amt", type: "calculation", formula: "[q] * [qty]" }] },
    { key: "t", type: "calculation", label: "Total", formula: "SUM([items.amt])" },
  ];
  assert.strictEqual(findCalculationProblems(fields), null);
});

test("publish check: plain-language problems", () => {
  const base = [{ key: "qty", type: "number" }];
  assert.match(findCalculationProblems([...base, { key: "t", label: "Total", type: "calculation", formula: "[qty] * [gone]" }]), /“Total”: \[gone\] isn't a field/);
  assert.match(findCalculationProblems([...base, { key: "t", label: "Total", type: "calculation", formula: "[qty] *" }]), /“Total”: .*ends too early/);
  assert.match(findCalculationProblems([...base, { key: "t", label: "Total", type: "calculation", formula: "" }]), /Type a formula/);
  assert.match(findCalculationProblems([{ key: "t", label: "Total", type: "calculation", formula: "[t] + 1" }]), /own result/);
  assert.match(findCalculationProblems([{ key: "t", label: "Total", type: "calculation", formula: "1", decimals: 7 }]), /decimals must be between 0 and 4/);
  assert.match(findCalculationProblems([{ key: "t", label: "Total", type: "calculation", formula: "1", result_type: "text" }]), /number or a date/);
  assert.match(findCalculationProblems([{ key: "t", label: "T", type: "calculation", formula: "1", result_ranges: [{ from: "x", label: "a" }] }]), /needs a number and a name/);
});

test("publish check: two calculations that use each other", () => {
  const fields = [
    { key: "a", label: "A", type: "calculation", formula: "[b]" },
    { key: "b", label: "B", type: "calculation", formula: "[a]" },
  ];
  assert.match(findCalculationProblems(fields), /use each other's results/);
});

test("publish check: a row calculation that needs the total of its own table is circular", () => {
  const fields = [
    { key: "items", label: "Items", type: "repeater", columns: [{ key: "q", type: "number" }, { key: "share", label: "Share", type: "calculation", formula: "[q] / [total]" }] },
    { key: "total", type: "calculation", formula: "SUM([items.q])" },
  ];
  assert.match(findCalculationProblems(fields), /go round in a circle/);
});

test("publish check: a question table's score parts are allowed references", () => {
  const fields = [{ key: "checks", type: "question-table" }, { key: "s", type: "calculation", formula: "[checks.score] / [checks.max_score]" }];
  assert.strictEqual(findCalculationProblems(fields), null);
  const bad = [{ key: "checks", type: "question-table" }, { key: "s", label: "S", type: "calculation", formula: "[checks.total]" }];
  assert.match(findCalculationProblems(bad), /\[checks\.total\] isn't a field/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
