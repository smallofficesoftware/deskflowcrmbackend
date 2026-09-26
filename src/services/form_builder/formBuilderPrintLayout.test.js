// Dependency-free self-test for formBuilderPrintLayout.js. Runnable directly:
//
//   node src/services/form_builder/formBuilderPrintLayout.test.js
import assert from "assert";
import {
  printBlocks,
  layoutSignature,
  estimateTextLines,
  planPages,
  emptyModeOf,
  lineForField,
  printableFields,
  answersFromStoredRow,
  tableHeightFor,
  PAGE,
} from "./formBuilderPrintLayout.js";

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

const FIELDS = [
  { key: "no", label: "No", type: "auto-number" },
  { key: "sec1", label: "Customer details", type: "section-header" },
  { key: "company", label: "Company", type: "text" },
  { key: "note", label: "Note", type: "instruction", content: "<b>Sign below</b>" },
  { key: "feas", label: "Feasibility", type: "question-table", questions: [{ id: "q1", text: "a" }, { id: "q2", text: "b" }] },
  { key: "sec2", label: "Quotation", type: "section-header" },
  { key: "items", label: "Items", type: "repeater", columns: [{ key: "q", type: "number", label: "Qty" }] },
  { key: "after", label: "After", type: "text" },
];

console.log("formBuilderPrintLayout.js self-test");

test("fields are grouped into blocks in form order", () => {
  const blocks = printBlocks(FIELDS);
  assert.deepStrictEqual(
    blocks.map((b) => (b.kind === "text" ? `text:${b.title}:${b.fields.map((f) => f.key).join("+")}` : `${b.kind}:${b.field.key}`)),
    ["text:null:no", "text:Customer details:company+note", "qtable:feas", "text:Quotation:", "repeater:items", "text:null:after"],
  );
});

test("text blocks are numbered so template and inputs agree", () => {
  const blocks = printBlocks(FIELDS).filter((b) => b.kind === "text");
  assert.deepStrictEqual(blocks.map((b) => b.index), [0, 1, 2, 3]);
});

test("layout signature changes with the layout, not with unrelated props", () => {
  const a = layoutSignature(FIELDS);
  assert.match(a, /^[0-9a-f]{10}$/);
  assert.strictEqual(layoutSignature(FIELDS.map((f) => ({ ...f, required: true }))), a);
  assert.notStrictEqual(layoutSignature([...FIELDS, { key: "z", label: "Z", type: "text" }]), a);
  assert.notStrictEqual(layoutSignature(FIELDS.map((f) => (f.key === "company" ? { ...f, label: "Firm" } : f))), a);
});

test("text line estimate: instructions wrap, textareas take 3", () => {
  assert.strictEqual(estimateTextLines({ fields: [{ type: "text" }, { type: "textarea" }] }), 4);
  assert.strictEqual(estimateTextLines({ fields: [{ type: "instruction", content: "x".repeat(200) }] }), 3);
  assert.strictEqual(estimateTextLines({ fields: [] }), 1);
});

test("small form fits on one page in order", () => {
  const pages = planPages(printBlocks(FIELDS.slice(0, 5)), { top: 40, bottom: 270 });
  assert.strictEqual(pages.length, 1);
  const ys = pages[0].items.map((i) => i.y);
  assert.deepStrictEqual([...ys].sort((a, b) => a - b), ys);
  assert.ok(pages[0].items[0].y >= 40);
});

test("a long form flows onto more pages and nothing crosses the bottom", () => {
  const many = Array.from({ length: 120 }, (_, i) => ({ key: `f${i}`, label: `Field ${i}`, type: "text" }));
  const blocks = [{ kind: "text", index: 0, title: null, fields: many.slice(0, 60) }, { kind: "text", index: 1, title: "More", fields: many.slice(60) }];
  const pages = planPages(blocks, { top: 40, bottom: 270 });
  assert.ok(pages.length >= 2);
  for (const p of pages) for (const item of p.items) assert.ok(item.y + item.height <= 270.0001, `item at ${item.y}+${item.height}`);
});

test("question table is sized by its questions and starts a new page when it doesn't fit", () => {
  const qs = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, text: "x" }));
  const blocks = [
    { kind: "text", index: 0, title: null, fields: Array.from({ length: 40 }, (_, i) => ({ key: `a${i}`, type: "text" })) },
    { kind: "qtable", field: { key: "t", questions: qs } },
  ];
  const pages = planPages(blocks, { top: 40, bottom: 270 });
  assert.strictEqual(pages.length, 2);
  assert.strictEqual(pages[1].items[0].block.kind, "qtable");
  assert.strictEqual(pages[1].items[0].height, tableHeightFor(20));
});

test("the first repeater takes the rest of its page; a second one gets its own page", () => {
  const rep = (key) => ({ kind: "repeater", field: { key, columns: [] } });
  const blocks = [{ kind: "text", index: 0, title: null, fields: [{ key: "a", type: "text" }] }, rep("r1"), rep("r2")];
  const pages = planPages(blocks, { top: 40, bottom: 270 });
  assert.strictEqual(pages.length, 2);
  const r1 = pages[0].items[1];
  assert.ok(r1.y + r1.titleHeight + r1.height <= 270.0001);
  assert.strictEqual(pages[1].items[0].block.field.key, "r2");
  assert.strictEqual(pages[1].items[0].y, 40);
});

test("a form that is only headings prints nothing", () => {
  assert.deepStrictEqual(planPages([{ kind: "text", index: 0, title: null, fields: [] }], { top: 40, bottom: 270 }), [{ items: [] }]);
});

test("unanswered fields follow the form's print setting", () => {
  const f = { key: "c", label: "Company", type: "text" };
  assert.strictEqual(lineForField(f, "Acme", "dash"), "Company: Acme");
  assert.strictEqual(lineForField(f, null, "dash"), "Company: -");
  assert.strictEqual(lineForField(f, "", "line"), "Company: ______________________________");
  assert.strictEqual(lineForField(f, null, "hide"), null);
  assert.strictEqual(lineForField(f, "Acme", "hide"), "Company: Acme");
});

test("instructions print their text; headings print nothing themselves", () => {
  assert.strictEqual(lineForField({ type: "instruction", content: "<i>Read</i> this" }, null, "dash"), "Read this");
  assert.strictEqual(lineForField({ type: "instruction", content: "" }, null, "dash"), null);
  assert.strictEqual(lineForField({ type: "section-header", label: "H" }, null, "dash"), null);
});

test("a question table prints its lines under the label", () => {
  assert.strictEqual(lineForField({ type: "question-table", label: "Feas" }, "1. a — Yes", "dash"), "Feas:\n1. a — Yes");
});

test("print setting is read from the form settings", () => {
  assert.strictEqual(emptyModeOf(null), "dash");
  assert.strictEqual(emptyModeOf('{"print":{"empty_fields":"line"}}'), "line");
  assert.strictEqual(emptyModeOf({ print: { empty_fields: "hide" } }), "hide");
  assert.strictEqual(emptyModeOf({ print: { empty_fields: "nonsense" } }), "dash");
  assert.strictEqual(emptyModeOf("not json"), "dash");
});

test("fields hidden by a rule are not printed", () => {
  const fields = [
    { key: "verdict", label: "Verdict", type: "dropdown" },
    { key: "reason", label: "Reason", type: "text", conditions: { rules: [{ field: "verdict", op: "is", value: "Reject" }] } },
  ];
  assert.deepStrictEqual(printableFields(fields, { verdict: "Accept" }).map((f) => f.key), ["verdict"]);
  assert.deepStrictEqual(printableFields(fields, { verdict: "Reject" }).map((f) => f.key), ["verdict", "reason"]);
});

test("stored JSON columns are parsed for the rules", () => {
  const fields = [{ key: "tags", type: "multi-select" }, { key: "grid", type: "question-table" }];
  const a = answersFromStoredRow(fields, { tags: '["a","b"]', grid: '{"q1":{"answer":"Yes"}}', other: "x" });
  assert.deepStrictEqual(a.tags, ["a", "b"]);
  assert.deepStrictEqual(a.grid, { q1: { answer: "Yes" } });
  assert.strictEqual(a.other, "x");
  assert.strictEqual(answersFromStoredRow(fields, { tags: "{oops" }).tags, "{oops");
});

test("page constants match A4", () => {
  assert.strictEqual(PAGE.width, 210);
  assert.strictEqual(PAGE.height, 297);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
