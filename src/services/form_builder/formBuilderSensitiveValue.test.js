// Dependency-free self-test for formBuilderSensitiveValue.js — same style as
// formBuilderFormatPresets.test.js (Node's built-in assert, no framework).
// Runnable directly:
//
//   node src/services/form_builder/formBuilderSensitiveValue.test.js
//
// Sets its own throwaway FORM_BUILDER_ENCRYPTION_KEY — the module reads
// process.env on every call, so the key can be swapped/removed per test.
// No .env file and no DB are touched.
import assert from "assert";
import {
  SENSITIVE_PREFIX,
  isSensitiveStorageConfigured,
  isEncryptedAadhaarField,
  isSensitiveStored,
  encryptSensitive,
  decryptSensitive,
  maskAadhaar,
  maskSensitiveValues,
  maskRepeaterRows,
  sensitiveStoragePublishMessage,
} from "./formBuilderSensitiveValue.js";

const KEY_A = "0123456789abcdef".repeat(4);
const KEY_B = "fedcba9876543210".repeat(4);
const AADHAAR = "234567891234";

let passed = 0;
let failed = 0;

function test(name, fn) {
  process.env.FORM_BUILDER_ENCRYPTION_KEY = KEY_A;
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

const encField = { key: "aadhaar_no", label: "Aadhaar", type: "text", format_preset: "aadhaar", sensitive_storage: "encrypted" };

console.log("formBuilderSensitiveValue.js self-test");

// ---- round trip / format ----

test("round trip: decrypt(encrypt(x)) === x", () => {
  assert.strictEqual(decryptSensitive(encryptSensitive(AADHAAR)), AADHAAR);
});

test("stored format is fbenc:v1:<last4>:<iv>:<tag>:<ct> and fits VARCHAR(255)", () => {
  const stored = encryptSensitive(AADHAAR);
  assert.ok(stored.startsWith(SENSITIVE_PREFIX), stored);
  assert.ok(/^fbenc:v1:1234:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(stored), stored);
  assert.ok(stored.length <= 255, `length ${stored.length}`);
  assert.ok(!stored.includes(AADHAAR), "full number must not appear in stored value");
});

test("same number encrypts differently each time (random IV)", () => {
  assert.notStrictEqual(encryptSensitive(AADHAAR), encryptSensitive(AADHAAR));
});

// ---- tamper / wrong key ----

test("tampered ciphertext fails cleanly (null, no throw)", () => {
  const stored = encryptSensitive(AADHAAR);
  const parts = stored.split(":");
  const ct = parts[5];
  parts[5] = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
  assert.strictEqual(decryptSensitive(parts.join(":")), null);
});

test("tampered auth tag fails cleanly", () => {
  const parts = encryptSensitive(AADHAAR).split(":");
  parts[4] = (parts[4][0] === "A" ? "B" : "A") + parts[4].slice(1);
  assert.strictEqual(decryptSensitive(parts.join(":")), null);
});

test("edited readable last4 fails cleanly (bound as auth data)", () => {
  const stored = encryptSensitive(AADHAAR).replace("fbenc:v1:1234:", "fbenc:v1:9999:");
  assert.strictEqual(decryptSensitive(stored), null);
});

test("garbage / non-encrypted input fails cleanly", () => {
  assert.strictEqual(decryptSensitive("XXXXXXXX1234"), null);
  assert.strictEqual(decryptSensitive(null), null);
  assert.strictEqual(decryptSensitive("fbenc:v1:1234:!!:!!:!!"), null);
});

test("wrong key fails cleanly", () => {
  const stored = encryptSensitive(AADHAAR);
  process.env.FORM_BUILDER_ENCRYPTION_KEY = KEY_B;
  assert.strictEqual(decryptSensitive(stored), null);
});

// ---- missing / invalid key ----

test("missing key: not configured, encrypt throws, decrypt returns null", () => {
  const stored = encryptSensitive(AADHAAR);
  delete process.env.FORM_BUILDER_ENCRYPTION_KEY;
  assert.strictEqual(isSensitiveStorageConfigured(), false);
  assert.throws(() => encryptSensitive(AADHAAR), /not configured/);
  assert.strictEqual(decryptSensitive(stored), null);
  // Masking never needs the key.
  assert.strictEqual(maskAadhaar(stored), "XXXXXXXX1234");
});

test("malformed key (wrong length / not hex) counts as not configured", () => {
  process.env.FORM_BUILDER_ENCRYPTION_KEY = "abc123";
  assert.strictEqual(isSensitiveStorageConfigured(), false);
  process.env.FORM_BUILDER_ENCRYPTION_KEY = "z".repeat(64);
  assert.strictEqual(isSensitiveStorageConfigured(), false);
  process.env.FORM_BUILDER_ENCRYPTION_KEY = KEY_A;
  assert.strictEqual(isSensitiveStorageConfigured(), true);
});

// ---- masking ----

test("maskAadhaar: stored, plain digits, already masked, empty", () => {
  assert.strictEqual(maskAadhaar(encryptSensitive(AADHAAR)), "XXXXXXXX1234");
  assert.strictEqual(maskAadhaar("2345 6789 0123"), "XXXXXXXX0123");
  assert.strictEqual(maskAadhaar("XXXXXXXX1234"), "XXXXXXXX1234");
  assert.strictEqual(maskAadhaar(null), null);
  assert.strictEqual(maskAadhaar(""), "");
  assert.strictEqual(maskAadhaar("something else"), "XXXXXXXXXXXX");
});

test("maskSensitiveValues: masks encrypted values, leaves the rest", () => {
  const row = { id: 7, aadhaar_no: encryptSensitive(AADHAAR), name: "Ravi" };
  const out = maskSensitiveValues([encField], row);
  assert.deepStrictEqual(out, { id: 7, aadhaar_no: "XXXXXXXX1234", name: "Ravi" });
  assert.ok(isSensitiveStored(row.aadhaar_no), "original row must not be mutated");
});

test("maskSensitiveValues: decided by stored value even if field is now masked / removed", () => {
  const row = { old_field: encryptSensitive(AADHAAR), aadhaar_no: "XXXXXXXX5678" };
  const out = maskSensitiveValues([{ ...encField, sensitive_storage: "masked" }], row);
  assert.strictEqual(out.old_field, "XXXXXXXX1234");
  assert.strictEqual(out.aadhaar_no, "XXXXXXXX5678");
});

test("maskSensitiveValues: already-masked value on an encrypted field shown as-is", () => {
  const row = { aadhaar_no: "XXXXXXXX5678" };
  assert.strictEqual(maskSensitiveValues([encField], row), row);
});

test("maskRepeaterRows: masks sub-field values per repeater", () => {
  const fields = [{ key: "members", type: "repeater", columns: [encField] }];
  const out = maskRepeaterRows(fields, { members: [{ id: 1, aadhaar_no: encryptSensitive(AADHAAR) }, { id: 2, aadhaar_no: null }] });
  assert.deepStrictEqual(out.members, [{ id: 1, aadhaar_no: "XXXXXXXX1234" }, { id: 2, aadhaar_no: null }]);
});

// ---- field detection / publish checks ----

test("isEncryptedAadhaarField: only aadhaar preset + encrypted + preset type", () => {
  assert.strictEqual(isEncryptedAadhaarField(encField), true);
  assert.strictEqual(isEncryptedAadhaarField({ ...encField, sensitive_storage: undefined }), false);
  assert.strictEqual(isEncryptedAadhaarField({ ...encField, sensitive_storage: "masked" }), false);
  assert.strictEqual(isEncryptedAadhaarField({ ...encField, format_preset: "pan" }), false);
  assert.strictEqual(isEncryptedAadhaarField({ ...encField, type: "number" }), false);
});

test("publish: fine with key set", () => {
  assert.strictEqual(sensitiveStoragePublishMessage([encField]), null);
});

test("publish: key missing -> plain message naming the field", () => {
  delete process.env.FORM_BUILDER_ENCRYPTION_KEY;
  const msg = sensitiveStoragePublishMessage([encField]);
  assert.ok(/Secure storage isn't set up on this server yet, so “Aadhaar” can't keep the full number/.test(msg), msg);
  assert.ok(/Last 4 digits only/.test(msg), msg);
});

test("publish: key missing but field is masked -> fine", () => {
  delete process.env.FORM_BUILDER_ENCRYPTION_KEY;
  assert.strictEqual(sensitiveStoragePublishMessage([{ ...encField, sensitive_storage: "masked" }]), null);
});

test("publish: unique + encrypted rejected", () => {
  const msg = sensitiveStoragePublishMessage([{ ...encField, unique: true }]);
  assert.ok(msg && /unique/i.test(msg) && msg.includes("“Aadhaar”"), msg);
});

test("publish: repeater sub-field checked too", () => {
  delete process.env.FORM_BUILDER_ENCRYPTION_KEY;
  const msg = sensitiveStoragePublishMessage([{ key: "members", label: "Members", type: "repeater", columns: [encField] }]);
  assert.ok(msg && msg.includes("“Aadhaar” (in “Members”)"), msg);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
