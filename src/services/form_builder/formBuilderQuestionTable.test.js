// Dependency-free self-test for formBuilderQuestionTable.js. Runnable directly:
//
//   node src/services/form_builder/formBuilderQuestionTable.test.js
import assert from "assert";
import { evaluateVisibility } from "./formBuilderConditions.js";
import {
  answerColumnsOf,
  visibleQuestionIds,
  validateQuestionTableValue,
  scoreQuestionTable,
  findQuestionTableProblems,
  questionTableText,
} from "./formBuilderQuestionTable.js";

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

const table = (extra = {}) => ({
  key: "feasibility",
  label: "Feasibility",
  type: "question-table",
  questions: [
    { id: "q1", text: "Is the service in our scope?" },
    { id: "q2", text: "Is anyone available?", conditions: { match: "all", rules: [{ field: "feasibility", row: "q1", op: "is", value: "No" }] } },
    { id: "q3", text: "Can we outsource it?", required: true },
  ],
  answer_columns: [
    { key: "answer", label: "Yes / No", type: "yes_no" },
    { key: "c2", label: "Service No.", type: "text" },
  ],
  ...extra,
});

console.log("formBuilderQuestionTable.js self-test");

test("default column when none is set", () => {
  assert.deepStrictEqual(answerColumnsOf({}), [{ key: "answer", label: "Answer", type: "yes_no" }]);
});

test("a question shows only when its row rule is met", () => {
  const f = table();
  const fields = [f];
  const answersNo = { feasibility: { q1: { answer: "No" } } };
  const answersYes = { feasibility: { q1: { answer: "Yes" } } };
  assert.deepStrictEqual([...visibleQuestionIds(f, answersNo, fields, evaluateVisibility(fields, answersNo))].sort(), ["q1", "q2", "q3"]);
  assert.deepStrictEqual([...visibleQuestionIds(f, answersYes, fields, evaluateVisibility(fields, answersYes))].sort(), ["q1", "q3"]);
});

test("valid grid is cleaned: choices normalised, blanks dropped, unknown ids dropped", () => {
  const f = table();
  const { value, error } = validateQuestionTableValue(
    f,
    { q1: { answer: "yes", c2: " SP-1 " }, q3: { answer: "NO" }, zzz: { answer: "Yes" } },
    { visibleIds: new Set(["q1", "q3"]) },
  );
  assert.strictEqual(error, undefined);
  assert.deepStrictEqual(value, { q1: { answer: "Yes", c2: "SP-1" }, q3: { answer: "No" } });
});

test("hidden questions are dropped and never required", () => {
  const f = table();
  const { value, error } = validateQuestionTableValue(f, { q1: { answer: "Yes" }, q2: { answer: "Yes" }, q3: { answer: "No" } }, { visibleIds: new Set(["q1", "q3"]) });
  assert.strictEqual(error, undefined);
  assert.deepStrictEqual(Object.keys(value).sort(), ["q1", "q3"]);
});

test("a required question without an answer is named", () => {
  const { error } = validateQuestionTableValue(table(), { q1: { answer: "Yes" } }, { visibleIds: new Set(["q1", "q3"]) });
  assert.match(error, /“Can we outsource it\?” needs an answer/);
});

test("a wrong choice is rejected with the allowed ones", () => {
  const { error } = validateQuestionTableValue(table(), { q1: { answer: "Maybe" }, q3: { answer: "Yes" } });
  assert.match(error, /choose Yes, No/);
});

test("number and tick columns", () => {
  const f = { key: "t", label: "T", type: "question-table", questions: [{ id: "a", text: "Reading" }], answer_columns: [{ key: "answer", label: "Reading", type: "number" }] };
  assert.deepStrictEqual(validateQuestionTableValue(f, { a: { answer: "12.5" } }).value, { a: { answer: 12.5 } });
  assert.match(validateQuestionTableValue(f, { a: { answer: "abc" } }).error, /must be a number/);
  const g = { ...f, answer_columns: [{ key: "answer", label: "OK", type: "checkbox" }] };
  assert.deepStrictEqual(validateQuestionTableValue(g, { a: { answer: true } }).value, { a: { answer: 1 } });
});

test("JSON text is accepted; garbage is not", () => {
  assert.deepStrictEqual(validateQuestionTableValue(table({ questions: [{ id: "q1", text: "x" }] }), '{"q1":{"answer":"Yes"}}').value, { q1: { answer: "Yes" } });
  assert.match(validateQuestionTableValue(table(), "not json").error, /could not be read/);
  assert.match(validateQuestionTableValue(table(), [1, 2]).error, /could not be read/);
});

test("empty grid: null, or an error when the field is required", () => {
  const f = table({ questions: [{ id: "q1", text: "x" }] });
  assert.deepStrictEqual(validateQuestionTableValue(f, {}), { value: null });
  assert.match(validateQuestionTableValue(f, {}, { required: true }).error, /is required/);
});

test("scoring: default points, NA left out", () => {
  const f = table({ scored: true, questions: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }], answer_columns: [{ key: "answer", label: "A", type: "yes_no_na" }] });
  const stats = scoreQuestionTable(f, { a: { answer: "Yes" }, b: { answer: "No" }, c: { answer: "NA" } });
  assert.deepStrictEqual(stats, { score: 1, max_score: 2, answered: 3 });
});

test("scoring: custom points and unanswered questions", () => {
  const f = table({ scored: true, questions: [{ id: "a", text: "A", points: { Yes: 5, No: 0 } }, { id: "b", text: "B" }] });
  assert.deepStrictEqual(scoreQuestionTable(f, { a: { answer: "Yes" } }), { score: 5, max_score: 6, answered: 1 });
});

test("scoring: hidden questions are excluded; unscored table counts answers only", () => {
  const f = table({ scored: true, questions: [{ id: "a", text: "A" }, { id: "b", text: "B" }] });
  assert.deepStrictEqual(scoreQuestionTable(f, { a: { answer: "Yes" }, b: { answer: "Yes" } }, new Set(["a"])), { score: 1, max_score: 1, answered: 1 });
  const plain = table({ scored: false, questions: [{ id: "a", text: "A" }] });
  assert.deepStrictEqual(scoreQuestionTable(plain, { a: { answer: "Yes" } }), { score: 0, max_score: 0, answered: 1 });
});

test("scoring: pass/fail default points", () => {
  const f = table({ scored: true, questions: [{ id: "a", text: "A" }, { id: "b", text: "B" }], answer_columns: [{ key: "answer", label: "Result", type: "pass_fail" }] });
  assert.deepStrictEqual(scoreQuestionTable(f, { a: { answer: "Pass" }, b: { answer: "Fail" } }), { score: 1, max_score: 2, answered: 2 });
});

test("publish check: valid table passes", () => {
  assert.strictEqual(findQuestionTableProblems(table()), null);
});

test("publish check: plain-language problems", () => {
  assert.match(findQuestionTableProblems(table({ questions: [] })), /at least one question/);
  assert.match(findQuestionTableProblems(table({ questions: [{ id: "q1", text: "" }] })), /question 1 has no text/);
  assert.match(findQuestionTableProblems(table({ questions: [{ id: "q1", text: "a" }, { id: "q1", text: "b" }] })), /same internal id/);
  assert.match(findQuestionTableProblems(table({ answer_columns: [{ key: "x", label: "A", type: "yes_no" }] })), /main answer/);
  assert.match(findQuestionTableProblems(table({ answer_columns: [{ key: "answer", label: "A", type: "yes_no" }, { key: "c2", label: "B", type: "yes_no" }] })), /isn't allowed there/);
  assert.match(findQuestionTableProblems(table({ questions: [{ id: "q1", text: "a", points: { Maybe: 1 } }] })), /must be numbers/);
});

test("publish check: a question can only depend on one above it", () => {
  const f = table({
    questions: [
      { id: "q1", text: "a", conditions: { rules: [{ field: "feasibility", row: "q2", op: "is", value: "No" }] } },
      { id: "q2", text: "b" },
    ],
  });
  assert.match(findQuestionTableProblems(f), /ABOVE it/);
  const gone = table({ questions: [{ id: "q1", text: "a" }, { id: "q2", text: "b", conditions: { rules: [{ field: "feasibility", row: "q9", op: "is", value: "No" }] } }] });
  assert.match(findQuestionTableProblems(gone), /deleted/);
});

test("printable text: numbered, answered questions only, extra columns labelled", () => {
  const f = table();
  const text = questionTableText(f, JSON.stringify({ q1: { answer: "Yes", c2: "SP-1" }, q3: { answer: "No" } }));
  assert.strictEqual(text, "1. Is the service in our scope? — Yes; Service No.: SP-1\n3. Can we outsource it? — No");
  assert.strictEqual(questionTableText(f, null), "");
  assert.strictEqual(questionTableText(f, "not json"), "");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
