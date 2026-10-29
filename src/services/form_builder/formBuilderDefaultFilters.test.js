// Dependency-free self-test for formBuilderDefaultFilters.js - same style as formBuilderDateRules.test.js
// (Node's built-in assert, no framework). Runnable directly:
//
//   node src/services/form_builder/formBuilderDefaultFilters.test.js
import assert from "assert";
import {
  parseSavedFilters,
  findSavedFilterProblems,
  buildDefaultFilterClause,
  describeDefaultFilters,
  pickSavedFilter,
} from "./formBuilderDefaultFilters.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    console.error(`FAIL: ${name}\n  ${e.message}`);
  }
}

const quote = (k) => `\`${k}\``;
const fields = [
  { key: "due", label: "Due date", type: "date" },
  { key: "called_at", label: "Called at", type: "datetime" },
  { key: "abc", label: "Abc", type: "dropdown" },
  { key: "amount", label: "Amount", type: "number" },
  { key: "sig", label: "Sign", type: "signature" },
];
const grp = (match, ...rules) => ({ match, rules });
const filter = (id, name, match, groups, extra = {}) => ({ id, name, match, groups, ...extra });
const settings = (filters) => JSON.stringify({ saved_filters: filters });
const rule = (field, op, value, days) => ({ field, op, ...(value !== undefined ? { value } : {}), ...(days !== undefined ? { days } : {}) });

const example = filter("f1", "Overdue or due soon", "any", [
  grp("all", rule("due", "lt", undefined, 5), rule("abc", "is", "xyz")),
  grp("all", rule("due", "gt", undefined, 5), rule("abc", "is", "pqr")),
]);

test("parse: nothing saved -> []", () => {
  assert.deepStrictEqual(parseSavedFilters(null), []);
  assert.deepStrictEqual(parseSavedFilters("{}"), []);
  assert.deepStrictEqual(parseSavedFilters("not json"), []);
  assert.deepStrictEqual(parseSavedFilters(settings([])), []);
  assert.deepStrictEqual(parseSavedFilters(settings([filter("f1", "Empty", "any", [grp("all")])])), []);
});

test("parse: several saved filters keep id, name, default flag", () => {
  const out = parseSavedFilters(settings([example, filter("f2", "Open", "all", [grp("all", rule("abc", "is", "open"))], { is_default: true })]));
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out.map((f) => [f.id, f.name, f.is_default]), [["f1", "Overdue or due soon", false], ["f2", "Open", true]]);
});

test("the example: ((due + 5 < today AND abc = xyz) OR (due + 5 > today AND abc = pqr))", () => {
  const [f] = parseSavedFilters(settings([example]));
  const out = buildDefaultFilterClause(f, fields, { quote });
  const dueLt = "(`due` IS NOT NULL AND DATE(DATE_ADD(`due`, INTERVAL :dfv_0 DAY)) < CURDATE())";
  const dueGt = "(`due` IS NOT NULL AND DATE(DATE_ADD(`due`, INTERVAL :dfv_2 DAY)) > CURDATE())";
  assert.strictEqual(out.sql, `((${dueLt} AND \`abc\` = :dfv_1) OR (${dueGt} AND \`abc\` = :dfv_3))`);
  assert.deepStrictEqual(out.replacements, { dfv_0: 5, dfv_1: "xyz", dfv_2: 5, dfv_3: "pqr" });
  assert.strictEqual(describeDefaultFilters(f, fields), "(Due date + 5 days < today AND Abc is xyz) OR (Due date + 5 days > today AND Abc is pqr)");
});

test("an OR inside a group, the groups joined by AND", () => {
  const [f] = parseSavedFilters(settings([filter("f1", "x", "all", [grp("any", rule("abc", "is", "a"), rule("abc", "is", "b")), grp("all", rule("amount", "gt", "10"))])]));
  const out = buildDefaultFilterClause(f, fields, { quote });
  assert.ok(out.sql.startsWith("((`abc` = :dfv_0 OR `abc` = :dfv_1) AND (("));
  assert.strictEqual(out.replacements.dfv_2, 10);
});

test("pick: __default, none, a named id, an unknown id", () => {
  const filters = parseSavedFilters(settings([example, filter("f2", "Open", "all", [grp("all", rule("abc", "is", "open"))], { is_default: true })]));
  assert.strictEqual(pickSavedFilter(filters, "__default").id, "f2");
  assert.strictEqual(pickSavedFilter(filters, "f1").id, "f1");
  assert.strictEqual(pickSavedFilter(filters, ""), null);
  assert.strictEqual(pickSavedFilter(filters, undefined), null);
  assert.strictEqual(pickSavedFilter(filters, "nope"), null);
  assert.strictEqual(pickSavedFilter(parseSavedFilters(settings([example])), "__default"), null);
});

test("an older single default_filters is read as one default filter (flat and groups forms)", () => {
  const flat = parseSavedFilters(JSON.stringify({ default_filters: { match: "any", rules: [rule("abc", "is", "a"), rule("amount", "gt", "1")] } }));
  assert.strictEqual(flat.length, 1);
  assert.deepStrictEqual([flat[0].name, flat[0].is_default, flat[0].groups.length], ["Default filter", true, 2]);
  assert.strictEqual(describeDefaultFilters(flat[0], fields), "(Abc is a) OR (Amount > 1)");
  const grouped = parseSavedFilters(JSON.stringify({ default_filters: { match: "any", groups: example.groups } }));
  assert.strictEqual(grouped[0].groups.length, 2);
});

test("a single group reads without extra brackets", () => {
  const [f] = parseSavedFilters(settings([filter("f1", "x", "all", [grp("any", rule("abc", "is", "a"), rule("abc", "is", "b"))])]));
  assert.strictEqual(describeDefaultFilters(f, fields), "Abc is a OR Abc is b");
});

test("rules on a deleted or unsupported field are skipped; none usable -> null", () => {
  const [f] = parseSavedFilters(settings([filter("f1", "x", "any", [grp("all", rule("gone", "is", "a"), rule("sig", "is", "a"))])]));
  assert.strictEqual(buildDefaultFilterClause(f, fields, { quote }), null);
});

test("negative days and zero days, datetime fields", () => {
  const [f] = parseSavedFilters(settings([filter("f1", "x", "all", [grp("all", rule("due", "lt", undefined, -3), rule("called_at", "is", undefined, 0))])]));
  const out = buildDefaultFilterClause(f, fields, { quote });
  assert.deepStrictEqual(out.replacements, { dfv_0: -3, dfv_1: 0 });
  assert.ok(out.sql.includes("DATE(DATE_ADD(`called_at`, INTERVAL :dfv_1 DAY)) = CURDATE()"));
  assert.strictEqual(describeDefaultFilters(f, fields), "Due date - 3 days < today AND Called at is today");
});

test("values are never put in the SQL text", () => {
  const [f] = parseSavedFilters(settings([filter("f1", "x", "all", [grp("all", rule("abc", "contains", "x'; DROP TABLE a;--"))])]));
  const out = buildDefaultFilterClause(f, fields, { quote });
  assert.ok(!out.sql.includes("DROP"));
  assert.strictEqual(out.replacements.dfv_0, "%x'; DROP TABLE a;--%");
});

test("is_not keeps blanks, is_empty / is_not_empty need no value", () => {
  const [f] = parseSavedFilters(settings([filter("f1", "x", "all", [grp("all", rule("abc", "is_not", "a"), rule("abc", "is_empty"), rule("amount", "is_not_empty"))])]));
  const out = buildDefaultFilterClause(f, fields, { quote });
  assert.ok(out.sql.includes("`abc` IS NULL OR `abc` <> :dfv_0"));
  assert.ok(out.sql.includes("(`abc` IS NULL OR `abc` = '')"));
  assert.ok(out.sql.includes("`amount` IS NOT NULL"));
});

test("publish check: good set passes, nothing saved passes", () => {
  assert.strictEqual(findSavedFilterProblems(settings([example, filter("f2", "Open", "all", [grp("all", rule("abc", "is", "a"))], { is_default: true })]), fields), null);
  assert.strictEqual(findSavedFilterProblems("{}", fields), null);
  assert.strictEqual(findSavedFilterProblems(null, fields), null);
});

test("publish check: names, ids, default and empty filters", () => {
  const ok = grp("all", rule("abc", "is", "a"));
  assert.match(findSavedFilterProblems(settings([filter("f1", " ", "all", [ok])]), fields), /needs a name/);
  assert.match(findSavedFilterProblems(settings([filter("f1", "A".repeat(61), "all", [ok])]), fields), /up to 60/);
  assert.match(findSavedFilterProblems(settings([filter("f1", "A", "all", [ok]), filter("f1", "B", "all", [ok])]), fields), /could not be read/);
  assert.match(findSavedFilterProblems(settings([filter("f1", "A", "all", [ok], { is_default: true }), filter("f2", "B", "all", [ok], { is_default: true })]), fields), /Only one saved filter can be the default/);
  assert.match(findSavedFilterProblems(settings([filter("f1", "A", "all", [grp("all")])]), fields), /no conditions/);
  assert.match(findSavedFilterProblems(settings(Array.from({ length: 21 }, (_, i) => filter(`f${i}`, `F${i}`, "all", [ok]))), fields), /at most 20 filters/);
});

test("publish check: a bad condition names the filter", () => {
  const one = (r) => settings([filter("f1", "Mine", "all", [grp("all", r)])]);
  assert.match(findSavedFilterProblems(one(rule("gone", "is", "a")), fields), /“Mine”.*no longer on the form/);
  assert.match(findSavedFilterProblems(one(rule("sig", "is", "a")), fields), /can't be used/);
  assert.match(findSavedFilterProblems(one(rule("abc", "gt", "a")), fields), /pick a condition/);
  assert.match(findSavedFilterProblems(one(rule("abc", "is", " ")), fields), /enter the value/);
  assert.match(findSavedFilterProblems(one(rule("amount", "gt", "abc")), fields), /must be a number/);
  assert.match(findSavedFilterProblems(one(rule("due", "gt", undefined, 1.5)), fields), /whole number/);
});

test("publish check: group and condition limits inside one filter", () => {
  const r = rule("abc", "is", "a");
  assert.match(findSavedFilterProblems(settings([filter("f1", "A", "any", Array.from({ length: 11 }, () => grp("all", r)))]), fields), /at most 10 groups/);
  assert.match(findSavedFilterProblems(settings([filter("f1", "A", "any", [grp("all", ...Array.from({ length: 21 }, () => r))])]), fields), /at most 20 conditions/);
});

// ---- entry fields, more field types, more conditions ----------------------------------------------------
const more = [
  ...fields,
  { key: "paid", label: "Paid", type: "switch" },
  { key: "tags", label: "Tags", type: "multi-select", options: ["red", "blue"] },
  { key: "owner", label: "Owner", type: "user" },
  { key: "cust", label: "Customer", type: "customer-lookup" },
  { key: "ref", label: "Region", type: "reference", master: "area" },
  { key: "at", label: "Call time", type: "time" },
  { key: "calc_due", label: "Calc due", type: "calculation", result_type: "date" },
  { key: "city", label: "City", type: "text" },
];
const one = (r) => parseSavedFilters(settings([filter("f1", "x", "all", [grp("all", r)])]))[0];
const sql = (r, ctx) => buildDefaultFilterClause(one(r), more, { quote, ctx });
const problem = (r) => findSavedFilterProblems(settings([filter("f1", "Mine", "all", [grp("all", r)])]), more);

test("submitted on: preset, between, shifted days", () => {
  assert.strictEqual(sql(rule("_created", "preset", "this_month")).sql, "(((`created_date_time` IS NOT NULL AND DATE(`created_date_time`) BETWEEN CAST(DATE_FORMAT(CURDATE(), '%Y-%m-01') AS DATE) AND LAST_DAY(CURDATE()))))");
  assert.ok(sql(rule("_created", "preset", "last_7_days")).sql.includes("DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()"));
  const b = sql({ field: "_created", op: "between", value: "2026-10-01", value2: "2026-10-31" });
  assert.ok(b.sql.includes("BETWEEN :dfv_0a AND :dfv_0b"));
  assert.deepStrictEqual(b.replacements, { dfv_0a: "2026-10-01", dfv_0b: "2026-10-31" });
  assert.strictEqual(describeDefaultFilters(one(rule("_created", "preset", "last_week")), more), "Submitted on: last week");
  assert.strictEqual(describeDefaultFilters(one({ field: "_created", op: "between", value: "2026-10-01", value2: "2026-10-31" }), more), "Submitted on is between 2026-10-01 and 2026-10-31");
});

test("every preset is valid SQL text from the fixed list only", () => {
  for (const p of ["today", "yesterday", "tomorrow", "last_7_days", "last_30_days", "next_7_days", "this_week", "last_week", "this_month", "last_month", "this_year"]) {
    assert.ok(sql(rule("due", "preset", p)), p);
  }
  assert.strictEqual(sql(rule("due", "preset", "1); DROP TABLE x;--")), null);
});

test("status: is, is not, any of", () => {
  assert.ok(sql(rule("_status", "is", "3")).sql.includes("`submission_status_id` = :dfv_0"));
  assert.ok(sql(rule("_status", "is_not", "3")).sql.includes("`submission_status_id` IS NULL OR `submission_status_id` <> :dfv_0"));
  const any = sql({ field: "_status", op: "is_any_of", values: ["3", "4"], value_labels: ["Open", "Pending"] });
  assert.ok(any.sql.includes("`submission_status_id` IN (:dfv_0)"));
  assert.deepStrictEqual(any.replacements.dfv_0, [3, 4]);
  assert.strictEqual(describeDefaultFilters(one({ field: "_status", op: "is_any_of", values: ["3", "4"], value_labels: ["Open", "Pending"] }), more), "Status is any of Open, Pending");
  assert.match(problem(rule("_status", "is", "abc")), /could not be read/);
  assert.match(problem({ field: "_status", op: "is_any_of", values: [] }), /at least one/);
});

test("approval stage: waiting for me, completed, at a stage", () => {
  const ctx = { loginId: 7, pendingForMe: () => ({ sql: "(current_stage IN (:pendingStages))", replacements: { pendingStages: ["s1"] } }) };
  const waiting = sql(rule("_stage", "is", "waiting_for_me"), ctx);
  assert.ok(waiting.sql.includes("(current_stage IN (:pendingStages))"));
  assert.deepStrictEqual(waiting.replacements.pendingStages, ["s1"]);
  assert.ok(sql(rule("_stage", "is", "waiting_for_me"), { loginId: 7 }).sql.includes("1 = 0"));
  assert.ok(sql(rule("_stage", "is", "completed")).sql.includes("`stage_status` = 'completed'"));
  assert.ok(sql(rule("_stage", "at_stage", "s2")).sql.includes("`current_stage` = :dfv_0"));
  assert.strictEqual(describeDefaultFilters(one(rule("_stage", "is", "sent_back")), more), "Approval is sent back");
  assert.match(problem(rule("_stage", "is", "x")), /pick where/);
});

test("submitted by me, a user, any of users", () => {
  assert.deepStrictEqual(sql(rule("_submitted_by", "is", "__me"), { loginId: 7 }).replacements, { dfv_0: 7 });
  assert.ok(sql(rule("_submitted_by", "is", "__me")).sql.includes("1 = 0"));
  assert.deepStrictEqual(sql({ field: "owner", op: "is_any_of", values: ["__me", "5"] }, { loginId: 7 }).replacements.dfv_0, [7, 5]);
  assert.strictEqual(describeDefaultFilters(one(rule("_submitted_by", "is", "__me")), more), "Submitted by is me");
  assert.match(problem(rule("owner", "is", "abc")), /could not be read/);
});

test("checkbox / switch: yes and no", () => {
  assert.ok(sql(rule("paid", "is", "1")).sql.includes("`paid` = 1"));
  assert.ok(sql(rule("paid", "is", false)).sql.includes("`paid` = 0 OR `paid` IS NULL"));
  assert.strictEqual(describeDefaultFilters(one(rule("paid", "is", "0")), more), "Paid is no");
  assert.match(problem(rule("paid", "is", "maybe")), /yes or no/);
});

test("multi-select: has an option, has any of, empty (JSON text, LIKE-escaped)", () => {
  const has = sql(rule("tags", "contains", "red"));
  assert.ok(has.sql.includes("`tags` LIKE :dfv_0_0"));
  assert.strictEqual(has.replacements.dfv_0_0, '%"red"%');
  const any = sql({ field: "tags", op: "is_any_of", values: ["red", "blue"] });
  assert.strictEqual(any.sql, "(((`tags` LIKE :dfv_0_0 OR `tags` LIKE :dfv_0_1)))");
  assert.strictEqual(sql(rule("tags", "contains", "50%_off")).replacements.dfv_0_0, '%"50\\%\\_off"%');
  assert.ok(sql(rule("tags", "is_empty")).sql.includes("`tags` = '[]'"));
});

test("text: starts with, any of; contains escapes wildcards", () => {
  assert.strictEqual(sql(rule("city", "starts_with", "Sur")).replacements.dfv_0, "Sur%");
  assert.strictEqual(sql(rule("city", "contains", "100%")).replacements.dfv_0, "%100\\%%");
  assert.deepStrictEqual(sql({ field: "abc", op: "is_any_of", values: [" a ", "b"] }).replacements.dfv_0, ["a", "b"]);
  assert.strictEqual(describeDefaultFilters(one({ field: "abc", op: "is_any_of", values: ["a", "b"] }), more), "Abc is any of a, b");
});

test("number between; time compares; a calculated date is a date", () => {
  const nb = sql({ field: "amount", op: "between", value: "10", value2: "20" });
  assert.deepStrictEqual(nb.replacements, { dfv_0a: 10, dfv_0b: 20 });
  assert.ok(sql(rule("at", "gte", "09:30")).sql.includes("`at` >= :dfv_0"));
  assert.ok(sql({ field: "at", op: "between", value: "09:00", value2: "17:30" }).sql.includes("`at` BETWEEN :dfv_0a AND :dfv_0b"));
  assert.ok(sql(rule("calc_due", "preset", "today")).sql.includes("DATE(`calc_due`) BETWEEN CURDATE() AND CURDATE()"));
  assert.match(problem(rule("at", "is", "9am")), /HH:MM/);
  assert.match(problem({ field: "amount", op: "between", value: "1" }), /both values/);
  assert.match(problem({ field: "due", op: "between", value: "2026-10-31", value2: "2026-10-01" }), /must not be after/);
  assert.match(problem(rule("due", "preset", "next_year")), /pick a period/);
});

test("customer lookup by name, reference by id", () => {
  const c = sql(rule("cust", "contains", "Shah"));
  assert.ok(c.sql.includes("`cust` IN (SELECT id FROM `contact_masters`"));
  assert.strictEqual(c.replacements.dfv_0, "%Shah%");
  assert.ok(sql(rule("ref", "is", "12")).sql.includes("`ref` = :dfv_0"));
  assert.ok(sql(rule("ref", "is_empty")).sql.includes("`ref` IS NULL"));
  assert.match(problem(rule("ref", "is", "x")), /could not be read/);
});

test("a rule's condition must suit the field's kind", () => {
  assert.match(problem(rule("paid", "gt", "1")), /pick a condition/);
  assert.match(problem(rule("tags", "is", "red")), /pick a condition/);
  assert.match(problem(rule("_stage", "contains", "x")), /pick a condition/);
});

console.log(`formBuilderDefaultFilters: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
