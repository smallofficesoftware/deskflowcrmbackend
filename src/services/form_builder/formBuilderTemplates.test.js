// Every built-in starter form must publish as it is: this runs each one through
// the same checks publishForm runs (rules, dates, lookups, calculations,
// question tables, auto numbers, restrictions, approval) and builds its real
// CREATE TABLE statements. Runnable directly:
//
//   node src/services/form_builder/formBuilderTemplates.test.js
import assert from "assert";
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from "./formBuilderBuiltinTemplates.js";
import { instantiateTemplate, summarizeTemplate } from "./formBuilderTemplates.js";
import { findConditionProblems } from "./formBuilderConditions.js";
import { findDateRuleProblems } from "./formBuilderDateRules.js";
import { findLookupProblems } from "./formBuilderLookups.js";
import { findCalculationProblems } from "./formBuilderCalculations.js";
import { findQuestionTableProblems } from "./formBuilderQuestionTable.js";
import { validateAutoNumberConfig } from "./formBuilderAutoNumber.js";
import { findRestrictionProblems } from "./formBuilderFieldRestrictions.js";
import { findApprovalProblems } from "./formBuilderApproval.js";
import { buildCreateMainTableStatement, buildCreateRepeaterTableStatement, isValidFieldKey, isValidFormId } from "./formBuilderDdlBuilder.js";
import { buildValidatedAnswers } from "./formBuilderSubmissionService.js";
import { printBlocks } from "./formBuilderPrintLayout.js";

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

console.log("formBuilderTemplates.js self-test");

test("five starter forms with unique keys and titles", () => {
  assert.strictEqual(BUILTIN_TEMPLATES.length, 5);
  assert.strictEqual(new Set(BUILTIN_TEMPLATES.map((t) => t.key)).size, 5);
  assert.strictEqual(new Set(BUILTIN_TEMPLATES.map((t) => t.title)).size, 5);
  assert.strictEqual(getBuiltinTemplate("nope"), null);
});

for (const template of BUILTIN_TEMPLATES) {
  const { schema_json } = instantiateTemplate({ fields: template.fields });
  const fields = JSON.parse(schema_json);

  test(`${template.title}: field keys are valid and unique (incl. repeater columns)`, () => {
    const keys = [];
    for (const f of fields) {
      keys.push(f.key);
      for (const c of f.columns || []) keys.push(c.key);
    }
    for (const k of keys) assert.ok(isValidFieldKey(k), `invalid key ${k}`);
    assert.strictEqual(new Set(keys).size, keys.length, "duplicate key");
  });

  test(`${template.title}: passes every publish check`, () => {
    assert.strictEqual(findConditionProblems(fields), null);
    assert.strictEqual(findDateRuleProblems(fields), null);
    assert.strictEqual(findLookupProblems(fields), null);
    assert.strictEqual(findCalculationProblems(fields), null);
    assert.strictEqual(findRestrictionProblems(fields), null);
    assert.strictEqual(findApprovalProblems(null, fields), null);
    for (const f of fields.filter((x) => x.type === "question-table")) assert.strictEqual(findQuestionTableProblems(f), null);
    for (const f of fields.filter((x) => x.type === "auto-number")) assert.strictEqual(validateAutoNumberConfig(f, fields), null);
  });

  test(`${template.title}: real tables can be built`, () => {
    assert.ok(isValidFormId(7));
    assert.match(buildCreateMainTableStatement(7, fields), /CREATE TABLE/);
    for (const rep of fields.filter((x) => x.type === "repeater")) {
      assert.ok(rep.id > 0);
      assert.match(buildCreateRepeaterTableStatement(7, rep.id, rep.columns), /CREATE TABLE/);
    }
  });

  test(`${template.title}: ids are positive and unique`, () => {
    const ids = [];
    for (const f of fields) {
      ids.push(f.id);
      for (const c of f.columns || []) ids.push(c.id);
    }
    assert.ok(ids.every((i) => Number.isInteger(i) && i > 0));
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  test(`${template.title}: prints as blocks and summarises`, () => {
    assert.ok(printBlocks(fields).length > 0);
    const s = summarizeTemplate(template);
    assert.ok(s.field_count >= 5);
    assert.ok(s.description.length > 10);
  });
}

test("instantiating twice never shares objects with the template", () => {
  const t = BUILTIN_TEMPLATES[0];
  const a = JSON.parse(instantiateTemplate({ fields: t.fields }).schema_json);
  a[0].label = "CHANGED";
  const b = JSON.parse(instantiateTemplate({ fields: t.fields }).schema_json);
  assert.notStrictEqual(b[0].label, "CHANGED");
  assert.notStrictEqual(t.fields[0].label, "CHANGED");
});

test("settings are carried as JSON text", () => {
  assert.strictEqual(instantiateTemplate({ fields: [] }).settings_json, null);
  assert.strictEqual(instantiateTemplate({ fields: [], settings: { print: { empty_fields: "line" } } }).settings_json, '{"print":{"empty_fields":"line"}}');
  assert.strictEqual(instantiateTemplate({ fields: [], settings: '{"a":1}' }).settings_json, '{"a":1}');
});

// Fill in the Envitro counselling form the way a person would and check the server rules.
test("Counselling form: Reject needs a reason; Accept doesn't; feasibility rows follow Q1", () => {
  const fields = JSON.parse(instantiateTemplate({ fields: getBuiltinTemplate("customer_counselling_feasibility").fields }).schema_json);
  const base = { company_name: "Acme Labs", order_decision: "Accept", feasibility: { q1: { answer: "Yes", c2: "SP-1" } } };
  const ok = buildValidatedAnswers({ fields, answers: base, isPublic: false });
  assert.deepStrictEqual(ok.errors, []);
  assert.strictEqual(ok.columns.reason_of_rejection, null);

  const rejected = buildValidatedAnswers({ fields, answers: { ...base, order_decision: "Reject" }, isPublic: false });
  assert.ok(rejected.errors.some((e) => /Reason of rejection/.test(e)), rejected.errors.join("; "));

  const noQ1 = buildValidatedAnswers({ fields, answers: { ...base, feasibility: {} }, isPublic: false });
  assert.ok(noQ1.errors.some((e) => /Are the products or services in our scope/.test(e)), noQ1.errors.join("; "));

  const q1No = buildValidatedAnswers({ fields, answers: { ...base, feasibility: { q1: { answer: "No" } } }, isPublic: false });
  assert.deepStrictEqual(q1No.errors, []);
});

test("Counselling form: quotation rows are totalled on the server", () => {
  const fields = JSON.parse(instantiateTemplate({ fields: getBuiltinTemplate("customer_counselling_feasibility").fields }).schema_json);
  const r = buildValidatedAnswers({
    fields,
    answers: {
      company_name: "Acme",
      order_decision: "Accept",
      feasibility: { q1: { answer: "Yes" } },
      quotation_items: [{ particular: "Water test", item_value: 500, nos: 3, total_amount: 1 }, { particular: "Soil test", item_value: 250, nos: 2 }],
      grand_total: 1,
    },
    isPublic: false,
  });
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.repeaterRowSets.quotation_items.map((row) => row.total_amount), [1500, 500]);
  assert.strictEqual(r.columns.grand_total, 2000);
});

test("Site visit form: checklist score becomes a percentage", () => {
  const fields = JSON.parse(instantiateTemplate({ fields: getBuiltinTemplate("site_visit_report").fields }).schema_json);
  const r = buildValidatedAnswers({
    fields,
    answers: { site_name: "Plant 1", checklist: { q1: { answer: "Pass" }, q2: { answer: "Pass" }, q3: { answer: "Fail" }, q4: { answer: "Pass" } } },
    isPublic: false,
  });
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.columns.score_percent, 75);
});

test("Feedback form: average rating and the follow-up question", () => {
  const fields = JSON.parse(instantiateTemplate({ fields: getBuiltinTemplate("customer_feedback").fields }).schema_json);
  const r = buildValidatedAnswers({ fields, answers: { rating_quality: 5, rating_service: 4, rating_delivery: 3, would_recommend: "Yes", improve: "hidden" }, isPublic: true });
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.columns.average_rating, 4);
  assert.strictEqual(r.columns.improve, null);
});

test("Inquiry form works on a public link: staff-only field is dropped, mobile is checked", () => {
  const fields = JSON.parse(instantiateTemplate({ fields: getBuiltinTemplate("customer_inquiry").fields }).schema_json);
  const good = buildValidatedAnswers({ fields, answers: { name: "Asha", mobile: "98765 43210", heard_about_us: "Website" }, isPublic: true });
  assert.deepStrictEqual(good.errors, []);
  assert.strictEqual(good.columns.mobile, "919876543210");
  assert.ok(!("heard_about_us" in good.columns));
  const bad = buildValidatedAnswers({ fields, answers: { name: "Asha", mobile: "123" }, isPublic: true });
  assert.ok(bad.errors.some((e) => /mobile/i.test(e)));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
