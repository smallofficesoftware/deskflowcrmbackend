// Dependency-free self-test for the pure parts of formBuilderProductLookup.js.
//
//   node src/services/form_builder/formBuilderProductLookup.test.js
import assert from "assert";
import { findProductLookupProblems, PRODUCT_FILL_COLUMNS } from "./formBuilderProductLookup.js";

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

const repeater = (columns, extra = {}) => ({ key: "items", label: "Items", type: "repeater", columns, ...extra });
const productCol = (map) => ({ key: "product", label: "Product", type: "reference", master: "product", product_fill_map: map });

console.log("formBuilderProductLookup.js self-test");

test("no repeaters, or no product-lookup columns: nothing to check", () => {
  assert.strictEqual(findProductLookupProblems([]), null);
  assert.strictEqual(findProductLookupProblems([repeater([{ key: "note", type: "text", label: "Note" }])]), null);
  assert.strictEqual(findProductLookupProblems([repeater([productCol(null)])]), null);
});

test("a valid mapping passes", () => {
  const cols = [productCol({ rate: "rate", unit: "unit" }), { key: "rate", type: "currency", label: "Rate" }, { key: "unit", type: "text", label: "Unit" }];
  assert.strictEqual(findProductLookupProblems([repeater(cols)]), null);
});

test("unknown product detail rejected", () => {
  const cols = [productCol({ price: "rate" }), { key: "rate", type: "number", label: "Rate" }];
  assert.match(findProductLookupProblems([repeater(cols)]), /isn't a product detail/);
});

test("a deleted target column is named in plain words", () => {
  const cols = [productCol({ rate: "gone" })];
  assert.match(findProductLookupProblems([repeater(cols)]), /was deleted/);
});

test("wrong target column type rejected", () => {
  const cols = [productCol({ rate: "sig" }), { key: "sig", type: "signature", label: "Sig" }];
  assert.match(findProductLookupProblems([repeater(cols)]), /can't receive/);
});

test("two product details into one column rejected", () => {
  const cols = [productCol({ rate: "x", unit: "x" }), { key: "x", type: "text", label: "X" }];
  assert.match(findProductLookupProblems([repeater(cols)]), /two different product details/);
});

test("an unreadable map is rejected", () => {
  assert.match(findProductLookupProblems([repeater([{ ...productCol({}), product_fill_map: "x" }])]), /couldn't be read/);
});

test("every fillable product detail has a label", () => {
  assert.deepStrictEqual(Object.keys(PRODUCT_FILL_COLUMNS).sort(), ["product_code", "rate", "unit"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
