// Dependency-free self-test for formBuilderFormatPresets.js — same style as
// formBuilderDdlBuilder.test.js (Node's built-in assert, no framework).
// Runnable directly:
//
//   node src/services/form_builder/formBuilderFormatPresets.test.js
//
// Note: the module imports normalizeToTenDigit from utils/sharedFunctions.js,
// which loads .env.<NODE_ENV> on import — no DB query is made here.
import assert from "assert";
import { validateFormatPreset, FORMAT_PRESETS } from "./formBuilderFormatPresets.js";

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

function ok(preset, input, expectedStored) {
  const result = validateFormatPreset(preset, input);
  assert.strictEqual(result.error, null, `expected "${input}" to pass ${preset}, got: ${result.error}`);
  assert.strictEqual(result.value, expectedStored);
}

function bad(preset, input, messagePattern) {
  const result = validateFormatPreset(preset, input);
  assert.ok(result.error, `expected "${input}" to fail ${preset}`);
  if (messagePattern) assert.ok(messagePattern.test(result.error), result.error);
}

console.log("formBuilderFormatPresets.js self-test");

// ---- mobile ----

test("mobile: plain 10 digits", () => ok("mobile", "9876543210", "919876543210"));
test("mobile: +91 prefix with spaces", () => ok("mobile", "+91 98765 43210", "919876543210"));
test("mobile: 0 prefix", () => ok("mobile", "09876543210", "919876543210"));
test("mobile: dashes", () => ok("mobile", "98765-43210", "919876543210"));
test("mobile: 91 prefix without +", () => ok("mobile", "919876543210", "919876543210"));
test("mobile: rejects a number starting with 5", () => bad("mobile", "5876543210", /10-digit mobile/));
test("mobile: rejects 9 digits", () => bad("mobile", "987654321"));
test("mobile: rejects letters mixed in", () => bad("mobile", "98765abc43210"));
test("mobile: rejects a foreign-length number", () => bad("mobile", "+1 415 555 01234"));

// ---- email ----

test("email: valid, stored lowercase", () => ok("email", "Name@Example.COM", "name@example.com"));
test("email: rejects missing domain", () => bad("email", "name@", /valid email/));

// ---- GST ----

test("gst: valid, lowercase input stored uppercase", () => ok("gst", "24abcde1234f1z5", "24ABCDE1234F1Z5"));
test("gst: tolerates spaces", () => ok("gst", "24 ABCDE 1234 F1Z5", "24ABCDE1234F1Z5"));
test("gst: rejects wrong 14th character (must be Z)", () => bad("gst", "24ABCDE1234F1X5", /GST number \(e\.g\./));
test("gst: rejects 14 characters", () => bad("gst", "24ABCDE1234F1Z"));

// ---- PAN ----

test("pan: valid", () => ok("pan", "abcde1234f", "ABCDE1234F"));
test("pan: rejects digits in the first five", () => bad("pan", "ABC121234F", /PAN/));

// ---- IFSC ----

test("ifsc: valid", () => ok("ifsc", "sbin0001234", "SBIN0001234"));
test("ifsc: alphanumeric branch code", () => ok("ifsc", "HDFC0ABC123", "HDFC0ABC123"));
test("ifsc: rejects 5th character not 0", () => bad("ifsc", "SBIN1001234", /IFSC/));

// ---- pincode ----

test("pincode: valid", () => ok("pincode", "380015", "380015"));
test("pincode: tolerates a space", () => ok("pincode", "380 015", "380015"));
test("pincode: rejects leading 0", () => bad("pincode", "080015", /6-digit pincode/));
test("pincode: rejects 5 digits", () => bad("pincode", "38001"));

// ---- aadhaar ----

test("aadhaar: valid, stored masked", () => ok("aadhaar", "2345 6789 1234", "XXXXXXXX1234"));
test("aadhaar: dashes tolerated", () => ok("aadhaar", "2345-6789-0123", "XXXXXXXX0123"));
test("aadhaar: already-masked value passes unchanged (edit round-trip)", () => ok("aadhaar", "XXXXXXXX1234", "XXXXXXXX1234"));
test("aadhaar: lowercase masked value normalised", () => ok("aadhaar", "xxxxxxxx1234", "XXXXXXXX1234"));
test("aadhaar: rejects leading 1", () => bad("aadhaar", "123456789012", /Aadhaar/));
test("aadhaar: rejects leading 0", () => bad("aadhaar", "023456789012"));
test("aadhaar: rejects 11 digits", () => bad("aadhaar", "23456789123"));
test("aadhaar: error message never echoes the number", () => {
  const { error } = validateFormatPreset("aadhaar", "1234");
  assert.ok(!error.includes("1234"));
});

// ---- vehicle number ----

test("vehicle_no: standard", () => ok("vehicle_no", "GJ01AB1234", "GJ01AB1234"));
test("vehicle_no: spaces, dashes, lowercase", () => ok("vehicle_no", "gj-01 ab-1234", "GJ01AB1234"));
test("vehicle_no: single series letter", () => ok("vehicle_no", "MH12A1234", "MH12A1234"));
test("vehicle_no: single-digit RTO (DL3C...)", () => ok("vehicle_no", "DL3CAB1234", "DL3CAB1234"));
test("vehicle_no: BH series", () => ok("vehicle_no", "22 BH 1234 AA", "22BH1234AA"));
test("vehicle_no: rejects missing number", () => bad("vehicle_no", "GJ01AB", /vehicle number/));

// ---- misc ----

test("unknown preset passes the value through unchanged", () => {
  assert.deepStrictEqual(validateFormatPreset("nope", "anything"), { error: null, value: "anything" });
});

test("FORMAT_PRESETS lists every preset in the shared field contract", () => {
  assert.deepStrictEqual(
    [...FORMAT_PRESETS].sort(),
    ["aadhaar", "email", "gst", "ifsc", "mobile", "pan", "pincode", "vehicle_no"],
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
