// Dependency-free self-test for the pure parts of formBuilderFieldRestrictions.js.
//
//   node src/services/form_builder/formBuilderFieldRestrictions.test.js
import assert from "assert";
import {
  restrictionOf,
  computeRestrictions,
  writeLockedKeys,
  applyReadRestrictions,
  fieldsForExport,
  findRestrictionProblems,
  MASK_TEXT,
} from "./formBuilderFieldRestrictions.js";

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

const fields = [
  { key: "name", label: "Name", type: "text" },
  { key: "rate", label: "Rate", type: "currency", restriction: "hide" },
  { key: "cost", label: "Cost", type: "currency", restriction: "mask" },
  { key: "note", label: "Note", type: "text", restriction: "readonly" },
  { key: "odd", label: "Odd", type: "text", restriction: "banana" },
];

console.log("formBuilderFieldRestrictions.js self-test");

test("restriction mode defaults to none", () => {
  assert.strictEqual(restrictionOf({}), "none");
  assert.strictEqual(restrictionOf({ restriction: "banana" }), "none");
  assert.strictEqual(restrictionOf({ restriction: "mask" }), "mask");
});

test("people with the permission get no restrictions", () => {
  assert.deepStrictEqual(computeRestrictions(fields, true), { hidden: [], masked: [], readonly: [] });
});

test("everyone else: hidden, masked and read-only lists", () => {
  assert.deepStrictEqual(computeRestrictions(fields, false), { hidden: ["rate"], masked: ["cost"], readonly: ["note"] });
});

test("write-locked = hidden + masked + read-only", () => {
  assert.deepStrictEqual([...writeLockedKeys(computeRestrictions(fields, false))].sort(), ["cost", "note", "rate"]);
  assert.strictEqual(writeLockedKeys(undefined).size, 0);
});

test("reading a row: hidden removed, masked shown as ••••, others untouched", () => {
  const r = computeRestrictions(fields, false);
  const row = { id: 1, name: "A", rate: 50, cost: 30.5, note: "hello", cost2: 1 };
  assert.deepStrictEqual(applyReadRestrictions(row, r), { id: 1, name: "A", cost: MASK_TEXT, note: "hello", cost2: 1 });
});

test("an empty masked value stays empty (nothing to hide)", () => {
  const r = computeRestrictions(fields, false);
  assert.strictEqual(applyReadRestrictions({ cost: null }, r).cost, null);
  assert.strictEqual(applyReadRestrictions({ cost: "" }, r).cost, "");
});

test("the enriched parts follow: labels, repeater rows and files", () => {
  const f = [
    { key: "who", type: "user", restriction: "mask" },
    { key: "items", type: "repeater", restriction: "hide" },
    { key: "photo", type: "image", restriction: "mask" },
    { key: "other", type: "image" },
  ];
  const r = computeRestrictions(f, false);
  const row = {
    who: 4,
    items: undefined,
    _reference_labels: { who: "Asha", dept: "Food" },
    _repeaters: { items: [{ a: 1 }], keep: [{ b: 2 }] },
    _files: [
      { id: 1, field_key: "photo" },
      { id: 2, field_key: "other" },
    ],
  };
  const out = applyReadRestrictions(row, r);
  assert.strictEqual(out.who, MASK_TEXT);
  assert.deepStrictEqual(out._reference_labels, { who: MASK_TEXT, dept: "Food" });
  assert.deepStrictEqual(out._repeaters, { keep: [{ b: 2 }] });
  assert.deepStrictEqual(out._files, [{ id: 2, field_key: "other" }]);
});

test("the input row is not changed", () => {
  const r = computeRestrictions(fields, false);
  const row = { rate: 50, cost: 3 };
  applyReadRestrictions(row, r);
  assert.deepStrictEqual(row, { rate: 50, cost: 3 });
});

test("export leaves hidden fields out and keeps masked ones", () => {
  const r = computeRestrictions(fields, false);
  assert.deepStrictEqual(fieldsForExport(fields, r).map((f) => f.key), ["name", "cost", "note", "odd"]);
  assert.strictEqual(fieldsForExport(fields, undefined).length, fields.length);
});

test("publish check", () => {
  assert.match(findRestrictionProblems(fields), /“Odd”: choose who may see/);
  assert.match(findRestrictionProblems([{ key: "h", label: "Heading", type: "section-header", restriction: "hide" }]), /heading or note can't be restricted/);
  assert.strictEqual(findRestrictionProblems([{ key: "a", type: "text", restriction: "none" }, { key: "b", type: "text" }]), null);
  assert.strictEqual(findRestrictionProblems(fields.slice(0, 4)), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
