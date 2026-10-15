// Dependency-free self-test for formBuilderUserAccess.js and its use in
// formBuilderFieldRestrictions.js / formBuilderLookups.js.
//
//   node src/services/form_builder/formBuilderUserAccess.test.js
import assert from "assert";
import { hasUserAccess, userAccessEntry, userAccessModeFor, findUserAccessProblems } from "./formBuilderUserAccess.js";
import { computeRestrictions, findRestrictionProblems, isRestricted } from "./formBuilderFieldRestrictions.js";
import { isInternalOnlyField } from "./formBuilderLookups.js";

const access = [
  { user_id: 5, see: true, edit: true },
  { user_id: 6, see: true, edit: false },
  { user_id: 7, see: false, edit: false },
];
const field = (extra = {}) => ({ key: "salary", type: "number", label: "Salary", user_access: access, ...extra });

// ---- the list itself
assert.strictEqual(hasUserAccess(field()), true);
assert.strictEqual(hasUserAccess(field({ user_access: [] })), false);
assert.strictEqual(hasUserAccess({ key: "a" }), false);
assert.strictEqual(userAccessEntry(field(), "5").user_id, 5); // string ids from the request still match
assert.strictEqual(userAccessEntry(field(), 99), null);
assert.strictEqual(userAccessEntry(field(), null), null);

// ---- what each user gets
assert.strictEqual(userAccessModeFor(field(), 5), "none"); // full access
assert.strictEqual(userAccessModeFor(field(), 6), "readonly"); // see, no edit
assert.strictEqual(userAccessModeFor(field(), 7), "hide"); // listed, can't see
assert.strictEqual(userAccessModeFor(field(), 99), "hide"); // not listed

// ---- computeRestrictions
assert.deepStrictEqual(computeRestrictions([field()], false, 5), { hidden: [], masked: [], readonly: [] });
assert.deepStrictEqual(computeRestrictions([field()], false, 6), { hidden: [], masked: [], readonly: ["salary"] });
assert.deepStrictEqual(computeRestrictions([field()], false, 7), { hidden: ["salary"], masked: [], readonly: [] });
assert.deepStrictEqual(computeRestrictions([field()], false, 99), { hidden: ["salary"], masked: [], readonly: [] });
// The owner / see_masked_fields holder is never limited.
assert.deepStrictEqual(computeRestrictions([field()], true, 99), { hidden: [], masked: [], readonly: [] });
// A field with no list keeps its old restriction mode, whoever asks.
assert.deepStrictEqual(
  computeRestrictions([{ key: "a", type: "text", restriction: "mask" }], false, 5),
  { hidden: [], masked: ["a"], readonly: [] },
);
// A list wins over an old restriction mode on the same field.
assert.deepStrictEqual(computeRestrictions([field({ restriction: "hide" })], false, 5), { hidden: [], masked: [], readonly: [] });
assert.strictEqual(isRestricted(field()), true);
assert.strictEqual(isRestricted({ key: "a", type: "text" }), false);

// ---- public link: the toggle (visible_to) alone decides for a field with a list
assert.strictEqual(isInternalOnlyField(field()), false);
assert.strictEqual(isInternalOnlyField(field({ visible_to: "internal" })), true);
assert.strictEqual(isInternalOnlyField(field({ restriction: "hide" })), false); // list present
assert.strictEqual(isInternalOnlyField({ key: "a", type: "text", restriction: "hide" }), true); // old behavior kept

// ---- publish checks
assert.strictEqual(findUserAccessProblems([field()]), null);
assert.strictEqual(findRestrictionProblems([field()]), null);
assert.ok(findUserAccessProblems([field({ user_access: "x" })]));
assert.ok(findUserAccessProblems([field({ user_access: [{ user_id: 0, see: true, edit: true }] })]));
assert.ok(findUserAccessProblems([field({ user_access: [{ user_id: 5, see: true, edit: true }, { user_id: 5, see: true, edit: false }] })]));
assert.ok(findUserAccessProblems([field({ user_access: [{ user_id: 5, see: false, edit: true }] })]));
assert.ok(findUserAccessProblems([field({ type: "section-header" })]));
assert.strictEqual(findUserAccessProblems([field({ user_access: [], type: "section-header" })]), null);

console.log("formBuilderUserAccess: all tests passed");
