// Dependency-free self-test for formBuilderLookups.js — same style as
// formBuilderFormatPresets.test.js. Runnable directly:
//
//   node src/services/form_builder/formBuilderLookups.test.js
import assert from "assert";
import {
  isUserMaster,
  customListIdOf,
  isExtraMaster,
  isInternalOnlyField,
  findLookupProblems,
  CONTACT_LOOKUP_COLUMNS,
} from "./formBuilderLookups.js";

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

console.log("formBuilderLookups.js self-test");

test("master parsing", () => {
  assert.strictEqual(isUserMaster("user"), true);
  assert.strictEqual(isUserMaster("country"), false);
  assert.strictEqual(customListIdOf("custom:12"), 12);
  assert.strictEqual(customListIdOf("custom:0"), null);
  assert.strictEqual(customListIdOf("custom:abc"), null);
  assert.strictEqual(customListIdOf("custom:1.5"), null);
  assert.strictEqual(customListIdOf("country"), null);
  assert.strictEqual(customListIdOf(undefined), null);
  assert.strictEqual(isExtraMaster("custom:3"), true);
  assert.strictEqual(isExtraMaster("user"), true);
  assert.strictEqual(isExtraMaster("state"), false);
});

test("internal-only fields", () => {
  assert.strictEqual(isInternalOnlyField({ type: "user" }), true);
  assert.strictEqual(isInternalOnlyField({ type: "customer-lookup" }), true);
  assert.strictEqual(isInternalOnlyField({ type: "reference", master: "user" }), true);
  assert.strictEqual(isInternalOnlyField({ type: "reference", master: "custom:2" }), false);
  assert.strictEqual(isInternalOnlyField({ type: "text", visible_to: "internal" }), true);
  assert.strictEqual(isInternalOnlyField({ type: "text" }), false);
  assert.strictEqual(isInternalOnlyField(null), false);
});

test("valid custom list reference passes; deleted list rejected with label", () => {
  const fields = [{ key: "division", label: "Division", type: "reference", master: "custom:5" }];
  assert.strictEqual(findLookupProblems(fields), null);
  assert.strictEqual(findLookupProblems(fields, { existingCustomListIds: new Set([5]) }), null);
  assert.match(findLookupProblems(fields, { existingCustomListIds: new Set([9]) }), /“Division” uses a list that was deleted/);
});

test("unreadable custom master rejected", () => {
  assert.match(findLookupProblems([{ key: "d", label: "Div", type: "reference", master: "custom:x" }]), /couldn't be read/);
});

test("customer-lookup mapping: valid", () => {
  const fields = [
    { key: "cust", label: "Customer", type: "customer-lookup", lookup_map: { company_name: "company", mobile_number: "phone" } },
    { key: "company", label: "Company", type: "text" },
    { key: "phone", label: "Phone", type: "phone" },
  ];
  assert.strictEqual(findLookupProblems(fields), null);
});

test("customer-lookup mapping: no mapping at all is fine", () => {
  assert.strictEqual(findLookupProblems([{ key: "c", label: "C", type: "customer-lookup" }]), null);
  assert.strictEqual(findLookupProblems([{ key: "c", label: "C", type: "customer-lookup", lookup_map: {} }]), null);
});

test("customer-lookup mapping: deleted target named in plain words", () => {
  const fields = [{ key: "cust", label: "Customer", type: "customer-lookup", lookup_map: { city: "gone" } }];
  assert.match(findLookupProblems(fields), /“Customer”.*city was deleted/);
});

test("customer-lookup mapping: wrong target type rejected", () => {
  const fields = [
    { key: "cust", label: "Customer", type: "customer-lookup", lookup_map: { person_name: "qty" } },
    { key: "qty", label: "Qty", type: "number" },
  ];
  assert.match(findLookupProblems(fields), /“Qty” can't receive/);
});

test("customer-lookup mapping: two details into one field rejected", () => {
  const fields = [
    { key: "cust", label: "Customer", type: "customer-lookup", lookup_map: { person_name: "x", company_name: "x" } },
    { key: "x", label: "Name", type: "text" },
  ];
  assert.match(findLookupProblems(fields), /two different customer details/);
});

test("customer-lookup mapping: unknown contact column rejected", () => {
  const fields = [
    { key: "cust", label: "Customer", type: "customer-lookup", lookup_map: { password: "x" } },
    { key: "x", label: "X", type: "text" },
  ];
  assert.match(findLookupProblems(fields), /isn't a customer detail/);
});

test("customer-lookup mapping: unreadable map rejected", () => {
  assert.match(findLookupProblems([{ key: "c", label: "C", type: "customer-lookup", lookup_map: "x" }]), /couldn't be read/);
});

test("contact columns are exactly the ones the search returns", () => {
  assert.deepStrictEqual(Object.keys(CONTACT_LOOKUP_COLUMNS).sort(), [
    "address", "city", "company_name", "email_id", "gst_number", "mobile_number", "person_name", "pincode",
  ]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
