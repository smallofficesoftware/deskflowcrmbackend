// Dependency-free self-test for formBuilderConditions.js — same style as
// formBuilderDdlBuilder.test.js (Node's built-in assert, no framework).
// Runnable directly:
//
//   node src/services/form_builder/formBuilderConditions.test.js
//
// Runs every case in formBuilderConditions.fixtures.json (the frontend copies
// that file verbatim and runs the same cases), then publish-check cases.
import assert from "assert";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  evaluateVisibility,
  isRequired,
  evaluateRule,
  findConditionProblems,
  CONDITION_OPERATORS,
} from "./formBuilderConditions.js";

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
const fixtures = JSON.parse(readFileSync(join(here, "formBuilderConditions.fixtures.json"), "utf8"));

// How a fixture is run — the frontend runner must do exactly the same.
// `outer` (optional) = the top level of the form when `fields` are a
// repeater's sub-fields and `answers` is one row.
function runFixture(fx) {
  let outer = null;
  if (fx.outer) {
    const outerVisible = evaluateVisibility(fx.outer.fields, fx.outer.answers);
    outer = { fields: fx.outer.fields, answers: fx.outer.answers, visible: outerVisible };
  }
  const visible = evaluateVisibility(fx.fields, fx.answers, outer);
  const required = fx.fields
    .filter((f) => f.key && isRequired(f, fx.answers, visible, { fields: fx.fields, outer }))
    .map((f) => f.key);
  return { visible: [...visible].sort(), required: required.sort() };
}

console.log("formBuilderConditions.js self-test");

console.log("fixtures:");
for (const fx of fixtures) {
  test(fx.name, () => {
    const { visible, required } = runFixture(fx);
    assert.deepStrictEqual(visible, [...fx.expectedVisible].sort(), "visible");
    assert.deepStrictEqual(required, [...fx.expectedRequired].sort(), "required");
  });
}

test("fixture names are unique", () => {
  const names = fixtures.map((f) => f.name);
  assert.strictEqual(new Set(names).size, names.length);
});

console.log("robustness:");
test("null / garbage input doesn't throw", () => {
  assert.deepStrictEqual([...evaluateVisibility(null, null)], []);
  assert.deepStrictEqual([...evaluateVisibility([null, 5, { key: "a", type: "text" }], "x")], ["a"]);
  assert.strictEqual(isRequired(null, {}, new Set()), false);
  assert.strictEqual(isRequired({ key: "a", required: true }, {}, null), false);
});
test("isRequired without options.fields compares type-blind", () => {
  const field = { key: "b", required_conditions: { rules: [{ field: "a", op: "is", value: "x" }] } };
  assert.strictEqual(isRequired(field, { a: "X" }, new Set(["a", "b"])), true);
  assert.strictEqual(isRequired(field, { a: "y" }, new Set(["a", "b"])), false);
});
test("evaluateRule row target (question-table, reserved)", () => {
  const src = { field: { type: "question-table" }, value: { r1: "No", r2: { answer: "Yes" } } };
  assert.strictEqual(evaluateRule({ field: "q", op: "is", value: "No", row: "r1" }, src), true);
  assert.strictEqual(evaluateRule({ field: "q", op: "is", value: "Yes", row: "r2" }, src), true);
  const arr = { field: { type: "question-table" }, value: [{ id: 1, answer: "No" }] };
  assert.strictEqual(evaluateRule({ field: "q", op: "is", value: "No", row: 1 }, arr), true);
  assert.strictEqual(evaluateRule({ field: "q", op: "is_empty", row: 2 }, arr), true);
});
test("operator list", () => {
  assert.deepStrictEqual(CONDITION_OPERATORS, ["is", "is_not", "is_empty", "is_not_empty", "contains", "gt", "lt", "any_of"]);
});

console.log("publish checks (findConditionProblems):");
const rule = (field, op = "is", value = "x") => ({ match: "all", rules: [{ field, op, value }] });

test("valid form -> null", () => {
  assert.strictEqual(
    findConditionProblems([
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text", conditions: rule("a"), required_conditions: rule("a", "is_empty") },
    ]),
    null,
  );
});
test("no fields / no rules -> null", () => {
  assert.strictEqual(findConditionProblems([]), null);
  assert.strictEqual(findConditionProblems(null), null);
});
test("rule on a deleted field names the field label", () => {
  const msg = findConditionProblems([{ key: "b", label: "Reason of rejection", type: "text", conditions: rule("order") }]);
  assert.ok(/“Reason of rejection”/.test(msg), msg);
  assert.ok(/deleted/.test(msg), msg);
});
test("required rule on a deleted field", () => {
  const msg = findConditionProblems([{ key: "b", label: "Remarks", type: "text", required_conditions: rule("gone") }]);
  assert.ok(/“Remarks”.*“Required only when”.*deleted/.test(msg), msg);
});
test("unknown operator", () => {
  const msg = findConditionProblems([
    { key: "a", label: "A", type: "text" },
    { key: "b", label: "B", type: "text", conditions: { match: "all", rules: [{ field: "a", op: "near" }] } },
  ]);
  assert.ok(/“B”.*couldn't be read/.test(msg), msg);
});
test("bad match value", () => {
  const msg = findConditionProblems([
    { key: "a", label: "A", type: "text" },
    { key: "b", label: "B", type: "text", conditions: { match: "some", rules: [{ field: "a", op: "is_empty" }] } },
  ]);
  assert.ok(/couldn't be read/.test(msg), msg);
});
test("any_of with nothing picked", () => {
  const msg = findConditionProblems([
    { key: "a", label: "A", type: "text" },
    { key: "b", label: "B", type: "text", conditions: { match: "all", rules: [{ field: "a", op: "any_of", value: [] }] } },
  ]);
  assert.ok(/nothing picked/.test(msg), msg);
});
test("rule on a section / file / repeater is rejected", () => {
  for (const type of ["section-header", "instruction", "file", "signature", "image", "repeater"]) {
    const msg = findConditionProblems([
      { key: "s", label: "Src", type },
      { key: "b", label: "B", type: "text", conditions: rule("s", "is_empty") },
    ]);
    assert.ok(/“Src”, which can't be used/.test(msg), `${type}: ${msg}`);
  }
});
test("self reference", () => {
  const msg = findConditionProblems([{ key: "a", label: "A", type: "text", conditions: rule("a") }]);
  assert.ok(/“A”.*uses itself/.test(msg), msg);
});
test("two-field circle names both labels", () => {
  const msg = findConditionProblems([
    { key: "a", label: "Order", type: "text", conditions: rule("b") },
    { key: "b", label: "Reason", type: "text", conditions: rule("a") },
  ]);
  assert.ok(/“Order”/.test(msg) && /“Reason”/.test(msg) && /depend on each other/.test(msg), msg);
});
test("three-field circle", () => {
  const msg = findConditionProblems([
    { key: "a", label: "A", type: "text", conditions: rule("c") },
    { key: "b", label: "B", type: "text", conditions: rule("a") },
    { key: "c", label: "C", type: "text", conditions: rule("b") },
  ]);
  assert.ok(/“A”/.test(msg) && /“B”/.test(msg) && /“C”/.test(msg), msg);
});
test("section rule on a field inside that section is a circle", () => {
  const msg = findConditionProblems([
    { key: "s", label: "Details", type: "section-header", conditions: rule("x") },
    { key: "x", label: "X", type: "text" },
  ]);
  assert.ok(/depend on each other/.test(msg) && /“Details”/.test(msg), msg);
});
test("section rule on a field in an earlier section is fine", () => {
  assert.strictEqual(
    findConditionProblems([
      { key: "x", label: "X", type: "text" },
      { key: "s", label: "Details", type: "section-header", conditions: rule("x") },
      { key: "y", label: "Y", type: "text", conditions: rule("x") },
    ]),
    null,
  );
});
test("required-only-when loop is not a circle", () => {
  assert.strictEqual(
    findConditionProblems([
      { key: "a", label: "A", type: "text", required_conditions: rule("b", "is_empty") },
      { key: "b", label: "B", type: "text", required_conditions: rule("a", "is_empty") },
    ]),
    null,
  );
});
test("repeater sub-field: row field and top-level field are fine", () => {
  assert.strictEqual(
    findConditionProblems([
      { key: "top", label: "Top", type: "switch" },
      {
        key: "items",
        label: "Items",
        type: "repeater",
        columns: [
          { key: "kind", label: "Kind", type: "text" },
          { key: "other", label: "Other", type: "text", conditions: rule("kind"), required_conditions: rule("top", "is", true) },
        ],
      },
    ]),
    null,
  );
});
test("repeater sub-field: deleted source names the repeater", () => {
  const msg = findConditionProblems([
    { key: "items", label: "Items", type: "repeater", columns: [{ key: "x", label: "X", type: "text", conditions: rule("gone") }] },
  ]);
  assert.ok(/“X” \(in “Items”\)/.test(msg), msg);
});
test("top-level rule on a sub-field is explained", () => {
  const msg = findConditionProblems([
    { key: "items", label: "Items", type: "repeater", columns: [{ key: "qty", label: "Qty", type: "number" }] },
    { key: "b", label: "B", type: "text", conditions: rule("qty", "gt", 1) },
  ]);
  assert.ok(/inside “Items”/.test(msg), msg);
});
test("repeater sub-field circle", () => {
  const msg = findConditionProblems([
    {
      key: "items",
      label: "Items",
      type: "repeater",
      columns: [
        { key: "a", label: "A", type: "text", conditions: rule("b") },
        { key: "b", label: "B", type: "text", conditions: rule("a") },
      ],
    },
  ]);
  assert.ok(/depend on each other/.test(msg) && /in “Items”/.test(msg), msg);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
