import assert from "node:assert/strict";
import { cleanDraftAnswers, keptDraftFields, leftOutOfDraft, MAX_DRAFT_CHARS } from "./formBuilderDrafts.js";

let passed = 0;
const t = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const fields = [
  { key: "name", label: "Name", type: "text" },
  { key: "age", label: "Age", type: "number" },
  { key: "photo", label: "Photo", type: "image" },
  { key: "no", label: "Number", type: "auto-number" },
  { key: "total", label: "Total", type: "calculation" },
  { key: "aadhaar", label: "Aadhaar", type: "text", format_preset: "aadhaar", sensitive_storage: "encrypted" },
  { key: "aadhaar2", label: "Aadhaar (last 4)", type: "text", format_preset: "aadhaar" },
  { key: "items", label: "Items", type: "repeater", columns: [] },
  { key: "head", label: "Head", type: "section-header" },
];

t("only fields a draft may hold are kept", () => {
  assert.deepEqual(keptDraftFields(fields).map((f) => f.key), ["name", "age", "items"]);
});

t("unknown keys, files, numbers and encrypted Aadhaar are dropped", () => {
  const out = cleanDraftAnswers(fields, { name: "Ravi", age: "abc", photo: "x", no: "N-1", aadhaar: "123412341234", evil: "1", items: [{ q: 1 }] });
  assert.deepEqual(out, { answers: { name: "Ravi", age: "abc", items: [{ q: 1 }] } });
});

t("an unfinished value is fine (no validation)", () => {
  assert.deepEqual(cleanDraftAnswers(fields, { age: "12abc" }), { answers: { age: "12abc" } });
});

t("nothing to save / not an object / too large", () => {
  assert.ok(cleanDraftAnswers(fields, {}).error);
  assert.ok(cleanDraftAnswers(fields, { photo: "x" }).error);
  assert.ok(cleanDraftAnswers(fields, null).error);
  assert.ok(cleanDraftAnswers(fields, [1]).error);
  assert.ok(cleanDraftAnswers(fields, { name: "x".repeat(MAX_DRAFT_CHARS + 1) }).error);
});

t("the left-out list names photos and Aadhaar", () => {
  assert.deepEqual(leftOutOfDraft(fields), ["Photo", "Aadhaar", "Aadhaar (last 4)"]);
});

console.log(`\n${passed} passed`);
