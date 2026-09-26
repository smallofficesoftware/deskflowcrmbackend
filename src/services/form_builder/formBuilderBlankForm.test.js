// Dependency-free self-test for formBuilderBlankForm.js. Runnable directly:
//
//   node src/services/form_builder/formBuilderBlankForm.test.js
import assert from "assert";
import { blankLineFor, BLANK_TABLE_ROWS } from "./formBuilderBlankForm.js";

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

console.log("formBuilderBlankForm.js self-test");

test("plain text field: a line to write on", () => {
  assert.match(blankLineFor({ type: "text", label: "Company" }), /^Company: _{10,}/);
});

test("choices print as tick boxes", () => {
  assert.strictEqual(blankLineFor({ type: "dropdown", label: "Order", options: ["Accept", "Reject"] }), "Order: [  ] Accept     [  ] Reject");
  assert.strictEqual(blankLineFor({ type: "checkbox", label: "Done" }), "Done: [  ] Yes     [  ] No");
});

test("dates, time, money, percentage", () => {
  assert.match(blankLineFor({ type: "date", label: "Date" }), /Date: ____ \/ ____ \/ ________/);
  assert.match(blankLineFor({ type: "time", label: "At" }), /At: ____ : ____/);
  assert.match(blankLineFor({ type: "currency", label: "Amount" }), /Amount: ₹ _+/);
  assert.match(blankLineFor({ type: "percentage", label: "Disc" }), /Disc: _+ %/);
});

test("headings, notes and signatures", () => {
  assert.strictEqual(blankLineFor({ type: "section-header", label: "Customer details" }), "\nCUSTOMER DETAILS");
  assert.strictEqual(blankLineFor({ type: "instruction", label: "n", content: "<b>Sign here</b>" }), "Sign here");
  assert.strictEqual(blankLineFor({ type: "instruction", label: "n", content: "" }), null);
  assert.match(blankLineFor({ type: "signature", label: "Counsellor" }), /Counsellor: _+/);
});

test("server-filled fields say so; repeaters print as a table instead", () => {
  assert.strictEqual(blankLineFor({ type: "auto-number", label: "No." }), "No.: (numbered automatically)");
  assert.strictEqual(blankLineFor({ type: "calculation", label: "Total" }), "Total: (worked out automatically)");
  assert.strictEqual(blankLineFor({ type: "repeater", label: "Items" }), null);
  assert.strictEqual(BLANK_TABLE_ROWS, 5);
});

test("question table: numbered questions with the answer boxes and extra columns", () => {
  const out = blankLineFor({
    type: "question-table",
    label: "Feasibility",
    questions: [{ id: "q1", text: "In scope?" }, { id: "q2", text: "Anyone free?" }],
    answer_columns: [{ key: "answer", label: "Yes/No", type: "yes_no" }, { key: "c2", label: "Service No.", type: "text" }],
  });
  const lines = out.split("\n");
  assert.strictEqual(lines[0], "Feasibility:");
  assert.match(lines[1], /^1\. In scope\?   \[  \] Yes   \[  \] No   Service No\.: _+/);
  assert.match(lines[2], /^2\. Anyone free\?/);
});

test("textarea gets two lines", () => {
  assert.strictEqual(blankLineFor({ type: "textarea", label: "Notes" }).split("\n").length, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
