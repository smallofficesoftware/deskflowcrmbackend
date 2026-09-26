// Dependency-free self-test for formBuilderExtraFieldValues.js. Runnable directly:
//
//   node src/services/form_builder/formBuilderExtraFieldValues.test.js
import assert from "assert";
import { validateExtraFieldValue, EXTRA_VALUE_TYPES } from "./formBuilderExtraFieldValues.js";

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

const ok = (field, input, expected) => {
  const r = validateExtraFieldValue(field, input);
  assert.strictEqual(r.error, undefined, `expected "${input}" to pass, got: ${r.error}`);
  assert.strictEqual(r.value, expected);
};
const bad = (field, input, pattern) => {
  const r = validateExtraFieldValue(field, input);
  assert.ok(r.error, `expected "${input}" to fail`);
  if (pattern) assert.match(r.error, pattern);
};

console.log("formBuilderExtraFieldValues.js self-test");

test("other types are not handled", () => {
  assert.strictEqual(validateExtraFieldValue({ type: "text" }, "x"), null);
  assert.deepStrictEqual([...EXTRA_VALUE_TYPES].sort(), ["currency", "location", "percentage", "time"]);
});

test("time: normalised to HH:mm:ss", () => {
  const f = { type: "time", label: "Arrival" };
  ok(f, "14:30", "14:30:00");
  ok(f, "9:05", "09:05:00");
  ok(f, "23:59:59", "23:59:59");
  ok(f, " 00:00 ", "00:00:00");
});

test("time: bad values name the field", () => {
  const f = { type: "time", label: "Arrival" };
  bad(f, "24:00", /Arrival: enter a time/);
  bad(f, "12:60", /enter a time/);
  bad(f, "noon", /enter a time/);
  bad(f, "12", /enter a time/);
});

test("currency: rounds to 2 decimals, accepts ₹ and commas", () => {
  const f = { type: "currency", label: "Amount" };
  ok(f, "1234.567", 1234.57);
  ok(f, "₹ 1,23,456.5", 123456.5);
  ok(f, 0, 0);
  ok(f, -20, -20);
});

test("currency: min / max and junk", () => {
  const f = { type: "currency", label: "Amount", min: 10, max: 500 };
  bad(f, "5", /at least 10/);
  bad(f, "501", /at most 500/);
  bad(f, "abc", /must be an amount/);
  bad(f, "1e20", /too large|at most/);
});

test("percentage: 0 to 100 by default", () => {
  const f = { type: "percentage", label: "Discount" };
  ok(f, "12.5", 12.5);
  ok(f, 100, 100);
  ok(f, 0, 0);
  bad(f, "-1", /at least 0%/);
  bad(f, "100.01", /at most 100%/);
});

test("percentage: builder limits replace the defaults", () => {
  const f = { type: "percentage", label: "Growth", min: -50, max: 500 };
  ok(f, "-25", -25);
  ok(f, "250", 250);
  bad(f, "501", /at most 500%/);
});

test("location: normalised to 6 decimals", () => {
  const f = { type: "location", label: "Site" };
  ok(f, "23.0225,72.5714", "23.022500,72.571400");
  ok(f, " -33.8688 , 151.2093 ", "-33.868800,151.209300");
  ok(f, "0,0", "0.000000,0.000000");
});

test("location: bad values", () => {
  const f = { type: "location", label: "Site" };
  bad(f, "91,10", /isn't a real location/);
  bad(f, "10,181", /isn't a real location/);
  bad(f, "here", /capture the location again/);
  bad(f, "12.5", /capture the location again/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
