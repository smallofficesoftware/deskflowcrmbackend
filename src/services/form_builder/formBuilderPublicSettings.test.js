// Dependency-free self-test for formBuilderPublicSettings.js. Runnable directly:
//
//   node src/services/form_builder/formBuilderPublicSettings.test.js
import assert from "assert";
import { parsePublicSettings, findPublicSettingsProblems, publicFormStatus } from "./formBuilderPublicSettings.js";

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

const settings = (p) => JSON.stringify({ public: p });
// Noon UTC = 17:30 IST, safely inside whatever IST calendar day is meant.
const NOON_UTC = (d) => new Date(`${d}T12:00:00Z`);

console.log("formBuilderPublicSettings.js self-test");

test("defaults when there are no public settings", () => {
  assert.deepStrictEqual(parsePublicSettings(null), {
    thank_you_message: "",
    redirect_url: "",
    open_date: null,
    close_date: null,
    max_entries: null,
    one_per_mobile: false,
    require_otp: false,
  });
  assert.deepStrictEqual(parsePublicSettings("not json").max_entries, null);
});

test("values are read and lightly cleaned", () => {
  const s = parsePublicSettings(settings({ thank_you_message: "Thanks!", max_entries: "50", one_per_mobile: true, require_otp: true }));
  assert.strictEqual(s.thank_you_message, "Thanks!");
  assert.strictEqual(s.max_entries, 50);
  assert.strictEqual(s.one_per_mobile, true);
  assert.strictEqual(s.require_otp, true);
});

test("a non-positive or non-numeric max_entries is ignored", () => {
  assert.strictEqual(parsePublicSettings(settings({ max_entries: 0 })).max_entries, null);
  assert.strictEqual(parsePublicSettings(settings({ max_entries: -5 })).max_entries, null);
  assert.strictEqual(parsePublicSettings(settings({ max_entries: "abc" })).max_entries, null);
});

test("publish check: valid settings pass", () => {
  assert.strictEqual(findPublicSettingsProblems(null), null);
  assert.strictEqual(findPublicSettingsProblems(settings({ open_date: "2026-01-01", close_date: "2026-12-31" })), null);
  assert.strictEqual(findPublicSettingsProblems(settings({ redirect_url: "https://example.com/thanks" })), null);
});

test("publish check: plain-language problems", () => {
  assert.match(findPublicSettingsProblems(settings({ open_date: "2026-12-31", close_date: "2026-01-01" })), /closing date is before/);
  assert.match(findPublicSettingsProblems(settings({ redirect_url: "example.com" })), /http:\/\/ or https:\/\//);
  assert.match(findPublicSettingsProblems(settings({ thank_you_message: "x".repeat(1001) })), /too long/);
});

test("open with no settings at all", () => {
  assert.deepStrictEqual(publicFormStatus(null, { now: NOON_UTC("2026-06-15") }), { open: true });
});

test("not open yet, and open again on the day itself", () => {
  const s = settings({ open_date: "2026-07-01" });
  assert.strictEqual(publicFormStatus(s, { now: NOON_UTC("2026-06-30") }).reason, "not_open_yet");
  assert.deepStrictEqual(publicFormStatus(s, { now: NOON_UTC("2026-07-01") }), { open: true });
});

test("closed the day after close_date, still open on close_date itself", () => {
  const s = settings({ close_date: "2026-07-31" });
  assert.deepStrictEqual(publicFormStatus(s, { now: NOON_UTC("2026-07-31") }), { open: true });
  assert.strictEqual(publicFormStatus(s, { now: NOON_UTC("2026-08-01") }).reason, "closed");
});

test("max entries reached, and not counted when entryCount is not given", () => {
  const s = settings({ max_entries: 10 });
  assert.strictEqual(publicFormStatus(s, { entryCount: 10 }).reason, "full");
  assert.deepStrictEqual(publicFormStatus(s, { entryCount: 9 }), { open: true });
  assert.deepStrictEqual(publicFormStatus(s, { entryCount: null }), { open: true });
});

test("IST day boundary: 11pm UTC on 30th is already 30th in IST, not the 31st", () => {
  // 2026-06-30T23:00:00Z + 5:30 = 2026-07-01T04:30 IST -> already "opened" on the 1st.
  const s = settings({ open_date: "2026-07-01" });
  assert.deepStrictEqual(publicFormStatus(s, { now: new Date("2026-06-30T23:00:00Z") }), { open: true });
  // 2026-06-30T17:00:00Z + 5:30 = 2026-06-30T22:30 IST -> still the 30th, not open yet.
  assert.strictEqual(publicFormStatus(s, { now: new Date("2026-06-30T17:00:00Z") }).reason, "not_open_yet");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
