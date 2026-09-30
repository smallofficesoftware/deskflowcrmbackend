// Dependency-free self-test for formBuilderDateRules.js and
// formBuilderPermissionKeys.js — same style as formBuilderDdlBuilder.test.js
// (Node's built-in assert, no framework). Runnable directly:
//
//   node src/services/form_builder/formBuilderDateRules.test.js
import assert from "assert";
import {
  DATE_EDIT_MODES,
  dateEditMode,
  canEditDate,
  serverDateValue,
  checkDateLimits,
  sameStoredDate,
  resolveDateValue,
  findDateRuleProblems,
} from "./formBuilderDateRules.js";
import {
  FORM_PERMISSION_KEYS,
  FORM_PERMISSION_LABELS,
  isValidPermissionKey,
  normalizePermissionEntry,
  normalizePermissionChanges,
} from "./formBuilderPermissionKeys.js";

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

// 26-09-2026 10:00 IST
const NOW = new Date("2026-09-26T04:30:00Z");
const dateField = (edit_rule, extra = {}) => ({ key: "entry_date", label: "Entry date", type: "date", edit_rule, ...extra });
const dtField = (edit_rule) => ({ key: "visited_at", label: "Visited at", type: "datetime", edit_rule });

console.log("formBuilderDateRules.js self-test");

test("modes list", () => assert.deepStrictEqual(DATE_EDIT_MODES, ["always", "never", "permission"]));
test("missing / unknown mode = always", () => {
  assert.strictEqual(dateEditMode(dateField(undefined)), "always");
  assert.strictEqual(dateEditMode(dateField({ mode: "sometimes" })), "always");
  assert.strictEqual(dateEditMode(dateField({ mode: "never" })), "never");
});
test("canEditDate by mode / permission / public", () => {
  assert.strictEqual(canEditDate(dateField({ mode: "always" })), true);
  assert.strictEqual(canEditDate(dateField({ mode: "always" }), { isPublic: true }), true);
  assert.strictEqual(canEditDate(dateField({ mode: "never" }), { canChangeDates: true }), false);
  assert.strictEqual(canEditDate(dateField({ mode: "permission" }), { canChangeDates: false }), false);
  assert.strictEqual(canEditDate(dateField({ mode: "permission" }), { canChangeDates: true }), true);
  assert.strictEqual(canEditDate(dateField({ mode: "permission" }), { canChangeDates: true, isPublic: true }), false);
});
test("serverDateValue: date = today in IST, datetime = now", () => {
  assert.strictEqual(serverDateValue(dateField(), NOW), "2026-09-26");
  // 20:00 UTC on the 25th is already the 26th in IST
  assert.strictEqual(serverDateValue(dateField(), new Date("2026-09-25T20:00:00Z")), "2026-09-26");
  assert.strictEqual(serverDateValue(dtField(), NOW), NOW);
});
test("resolveDateValue: never -> server on create, keep on update", () => {
  const f = dateField({ mode: "never" });
  assert.deepStrictEqual(resolveDateValue(f, { now: NOW }), { action: "server", value: "2026-09-26" });
  assert.deepStrictEqual(resolveDateValue(f, { isUpdate: true, storedValue: "2026-09-01", now: NOW }), { action: "keep" });
  // edit of an entry with nothing stored yet -> today
  assert.deepStrictEqual(resolveDateValue(f, { isUpdate: true, storedValue: null, now: NOW }), { action: "server", value: "2026-09-26" });
});
test("resolveDateValue: permission without the right behaves like never", () => {
  const f = dateField({ mode: "permission" });
  assert.strictEqual(resolveDateValue(f, { canChangeDates: false, now: NOW }).action, "server");
  assert.strictEqual(resolveDateValue(f, { canChangeDates: true, now: NOW }).action, "client");
  assert.strictEqual(resolveDateValue(f, { canChangeDates: true, isPublic: true, now: NOW }).action, "server");
});
test("resolveDateValue: always -> client", () => {
  assert.strictEqual(resolveDateValue(dateField(undefined), { now: NOW }).action, "client");
});
test("checkDateLimits: past_days", () => {
  const f = dateField({ mode: "always", past_days: 3 });
  assert.strictEqual(checkDateLimits(f, "2026-09-23", NOW), null);
  assert.strictEqual(checkDateLimits(f, "2026-09-22", NOW), "Entry date can't be more than 3 days in the past");
  assert.strictEqual(checkDateLimits(dateField({ past_days: 1 }), "2026-09-24", NOW), "Entry date can't be more than 1 day in the past");
  assert.strictEqual(checkDateLimits(dateField({ past_days: 0 }), "2026-09-25", NOW), "Entry date can't be a past date");
  assert.strictEqual(checkDateLimits(dateField({ past_days: 0 }), "2026-09-26", NOW), null);
  assert.strictEqual(checkDateLimits(dateField({ past_days: null }), "2020-01-01", NOW), null);
});
test("checkDateLimits: allow_future", () => {
  assert.strictEqual(checkDateLimits(dateField({ allow_future: false }), "2026-09-27", NOW), "Entry date can't be a future date");
  assert.strictEqual(checkDateLimits(dateField({ allow_future: false }), "2026-09-26", NOW), null);
  assert.strictEqual(checkDateLimits(dateField({ allow_future: true }), "2027-01-01", NOW), null);
  assert.strictEqual(checkDateLimits(dateField({}), "2027-01-01", NOW), null);
});
test("checkDateLimits: datetime compared by IST calendar day", () => {
  const f = dtField({ allow_future: false, past_days: 0 });
  assert.strictEqual(checkDateLimits(f, "2026-09-26T19:00:00Z", NOW), "Visited at can't be a future date"); // 27th 00:30 IST
  assert.strictEqual(checkDateLimits(f, "2026-09-26T17:00:00Z", NOW), null); // 26th 22:30 IST
  assert.strictEqual(checkDateLimits(f, "2026-09-25T17:00:00Z", NOW), "Visited at can't be a past date");
});
test("checkDateLimits: not a date -> left to the normal validator", () => {
  assert.strictEqual(checkDateLimits(dateField({ allow_future: false }), "garbage", NOW), null);
});
test("sameStoredDate", () => {
  assert.strictEqual(sameStoredDate(dateField(), "2026-09-01", "2026-09-01"), true);
  assert.strictEqual(sameStoredDate(dateField(), "2026-09-01", new Date("2026-08-31T18:30:00Z")), true);
  assert.strictEqual(sameStoredDate(dateField(), "2026-09-02", "2026-09-01"), false);
  assert.strictEqual(sameStoredDate(dateField(), "2026-09-02", null), false);
  assert.strictEqual(sameStoredDate(dtField(), "2026-09-01T10:00:00.400Z", new Date("2026-09-01T10:00:00Z")), true);
  assert.strictEqual(sameStoredDate(dtField(), "2026-09-01T10:01:00Z", new Date("2026-09-01T10:00:00Z")), false);
});
test("findDateRuleProblems", () => {
  assert.strictEqual(findDateRuleProblems([dateField({ mode: "never", past_days: 5, allow_future: false })]), null);
  assert.strictEqual(findDateRuleProblems([{ key: "t", type: "text", edit_rule: { mode: "odd" } }]), null); // ignored on non-date
  assert.ok(/“Entry date”.*couldn't be read/.test(findDateRuleProblems([dateField({ mode: "odd" })])));
  assert.ok(/whole number/.test(findDateRuleProblems([dateField({ past_days: -1 })])));
  assert.ok(/whole number/.test(findDateRuleProblems([dateField({ past_days: 1.5 })])));
  const nested = findDateRuleProblems([{ key: "r", label: "Visits", type: "repeater", columns: [dateField({ mode: 5 })] }]);
  assert.ok(/\(in “Visits”\)/.test(nested), nested);
});

console.log("formBuilderPermissionKeys.js self-test");

test("the seven keys", () => {
  assert.deepStrictEqual(FORM_PERMISSION_KEYS, [
    "change_dates",
    "override_auto_number",
    "see_masked_fields",
    "import_excel",
    "manage_schedules",
    "edit_completed",
    "convert",
  ]);
  for (const k of FORM_PERMISSION_KEYS) assert.ok(FORM_PERMISSION_LABELS[k], k);
});
test("isValidPermissionKey", () => {
  assert.strictEqual(isValidPermissionKey("change_dates"), true);
  assert.strictEqual(isValidPermissionKey("CHANGE_DATES"), false);
  assert.strictEqual(isValidPermissionKey("drop_table"), false);
  assert.strictEqual(isValidPermissionKey(null), false);
});
test("normalizePermissionEntry: user or team, exactly one", () => {
  assert.deepStrictEqual(normalizePermissionEntry({ permission_key: "convert", a_application_login_id: "12" }).value, {
    permission_key: "convert",
    a_application_login_id: 12,
    team_id: null,
  });
  assert.deepStrictEqual(normalizePermissionEntry({ permission_key: "convert", team_id: 3 }).value, {
    permission_key: "convert",
    a_application_login_id: null,
    team_id: 3,
  });
  assert.ok(normalizePermissionEntry({ permission_key: "convert" }).error);
  assert.ok(normalizePermissionEntry({ permission_key: "convert", a_application_login_id: 1, team_id: 2 }).error);
  assert.ok(normalizePermissionEntry({ permission_key: "convert", a_application_login_id: -1 }).error);
  assert.ok(normalizePermissionEntry({ permission_key: "convert", team_id: "abc" }).error);
  assert.ok(/Unknown permission/.test(normalizePermissionEntry({ permission_key: "x", team_id: 1 }).error));
  assert.ok(normalizePermissionEntry(null).error);
});
test("normalizePermissionChanges: lists, de-dup, first error wins", () => {
  const out = normalizePermissionChanges({
    grants: [
      { permission_key: "change_dates", a_application_login_id: 5 },
      { permission_key: "change_dates", a_application_login_id: "5" },
      { permission_key: "see_masked_fields", team_id: 2 },
    ],
    removals: [{ permission_key: "convert", a_application_login_id: 7 }],
  });
  assert.strictEqual(out.error, undefined);
  assert.strictEqual(out.grants.length, 2);
  assert.strictEqual(out.removals.length, 1);
  assert.deepStrictEqual(normalizePermissionChanges({}), { grants: [], removals: [] });
  assert.ok(normalizePermissionChanges({ grants: "x" }).error);
  assert.ok(normalizePermissionChanges({ removals: [{ permission_key: "nope", team_id: 1 }] }).error);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
