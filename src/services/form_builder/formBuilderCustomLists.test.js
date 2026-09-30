// Dependency-free self-test for formBuilderCustomLists.js's pure item
// cleaning (the DB-side handlers need a tenant DB and are not run here).
//
//   node src/services/form_builder/formBuilderCustomLists.test.js
import assert from "assert";
import { cleanListItems } from "./formBuilderCustomLists.js";

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

console.log("formBuilderCustomLists.js self-test");

test("trims labels, drops blanks, keeps ids", () => {
  const { items, error } = cleanListItems([{ id: 4, label: "  Food " }, { label: "" }, { label: "Water" }, { id: "x", label: "Soil" }]);
  assert.strictEqual(error, undefined);
  assert.deepStrictEqual(items, [
    { id: 4, label: "Food" },
    { id: null, label: "Water" },
    { id: null, label: "Soil" },
  ]);
});

test("duplicate labels (any case) rejected, naming the label", () => {
  assert.match(cleanListItems([{ label: "Food" }, { label: "food " }]).error, /“food” is in the list twice/);
});

test("empty list rejected", () => {
  assert.match(cleanListItems([]).error, /at least one item/);
  assert.match(cleanListItems([{ label: "  " }]).error, /at least one item/);
  assert.match(cleanListItems(undefined).error, /at least one item/);
});

test("too-long label rejected", () => {
  assert.match(cleanListItems([{ label: "x".repeat(151) }]).error, /too long/);
});

test("more than 500 items rejected", () => {
  const many = Array.from({ length: 501 }, (_, i) => ({ label: `Item ${i}` }));
  assert.match(cleanListItems(many).error, /at most 500/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
