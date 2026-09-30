// Question table field (plan item G): a numbered list of questions with an
// answer column (Yes/No, Pass/Fail, text, number, tick) and optional extra
// columns — the "Feasibility of the service" table on a paper form.
// Pure module: no DB. Unit-tested in formBuilderQuestionTable.test.js.
//
// Field props:
//   type: "question-table"
//   questions: [{
//     id: "q1",                       stable id, never reused
//     text: "Is the service in scope?",
//     required?: true,                the main answer must be filled
//     conditions?: { match, rules },  "show this question only when ..."
//                                     (same shape as a field's conditions; a
//                                     rule on ANOTHER question of this table
//                                     uses { field: <table key>, row: "<q id>" })
//     points?: { "Yes": 2, "No": 0 } overrides the default points
//   }]
//   answer_columns: [                 the first column is the main answer and
//     { key: "answer", label, type }, always has key "answer"
//     { key: "c2", label, type: "text" | "number" }
//   ]
//   scored?: true                     count points (see scoreQuestionTable)
//
// Saved value (JSON in one column of the form's table):
//   { "q1": { "answer": "Yes", "c2": "SP-12" }, "q2": { "answer": "No" } }
// Only answered, visible questions are kept. Because the main answer is
// always stored under "answer", conditions can read a row exactly as they
// read any other field (see readRowValue in formBuilderConditions.js).

import { evaluateConditionGroup } from "./formBuilderConditions.js";

export const MAIN_ANSWER_KEY = "answer";
export const ANSWER_COLUMN_TYPES = ["yes_no", "yes_no_na", "pass_fail", "text", "number", "checkbox"];
export const EXTRA_COLUMN_TYPES = ["text", "number"];

const CHOICES = {
  yes_no: ["Yes", "No"],
  yes_no_na: ["Yes", "No", "NA"],
  pass_fail: ["Pass", "Fail"],
};
// Default points when the table is scored: the "good" answer is 1, the other 0;
// NA is left out of the maximum.
const DEFAULT_POINTS = {
  yes_no: { Yes: 1, No: 0 },
  yes_no_na: { Yes: 1, No: 0 },
  pass_fail: { Pass: 1, Fail: 0 },
};

const MAX_QUESTIONS = 200;
const MAX_COLUMNS = 6;
const TEXT_MAX = 500;
const QUESTION_ID_PATTERN = /^[a-z][a-z0-9_]{0,29}$/i;
const COLUMN_KEY_PATTERN = /^[a-z][a-z0-9_]{0,29}$/;

export function answerColumnsOf(field) {
  const columns = Array.isArray(field?.answer_columns) ? field.answer_columns.filter((c) => c && typeof c === "object") : [];
  if (columns.length === 0) return [{ key: MAIN_ANSWER_KEY, label: "Answer", type: "yes_no" }];
  return columns;
}

export function mainColumnOf(field) {
  return answerColumnsOf(field)[0];
}

export function questionsOf(field) {
  return Array.isArray(field?.questions) ? field.questions.filter((q) => q && typeof q === "object" && q.id != null) : [];
}

export function choicesFor(type) {
  return CHOICES[type] || null;
}

function isBlank(v) {
  return v == null || (typeof v === "string" && v.trim() === "");
}

// Which questions are visible for these answers. `fields` = the form's top
// level fields, `visibleSet` = evaluateVisibility's result, `answers` = the
// submitted answers (the question table's own grid may be a JSON string or
// an object, so rules on other rows can read it).
export function visibleQuestionIds(field, answers, fields, visibleSet) {
  const ids = new Set();
  for (const q of questionsOf(field)) {
    const group = q.conditions;
    const ok = !group || !Array.isArray(group.rules) || group.rules.length === 0 || evaluateConditionGroup(group, fields, answers, visibleSet);
    if (ok) ids.add(String(q.id));
  }
  return ids;
}

function validateCell(column, raw, label) {
  if (isBlank(raw)) return { value: undefined };
  switch (column.type) {
    case "yes_no":
    case "yes_no_na":
    case "pass_fail": {
      const options = CHOICES[column.type];
      const hit = options.find((o) => o.toLowerCase() === String(raw).trim().toLowerCase());
      if (!hit) return { error: `${label}: choose ${options.join(", ")}` };
      return { value: hit };
    }
    case "number": {
      const num = Number(raw);
      if (!Number.isFinite(num)) return { error: `${label} must be a number` };
      return { value: num };
    }
    case "checkbox":
      return { value: raw === true || raw === 1 || raw === "1" || String(raw).toLowerCase() === "true" ? 1 : 0 };
    default: {
      const text = String(raw).trim();
      if (text.length > TEXT_MAX) return { error: `${label} can be at most ${TEXT_MAX} characters` };
      return { value: text };
    }
  }
}

function parseGrid(value) {
  if (value == null || value === "") return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value : null;
}

// Validate a submitted grid. `visibleIds` = Set from visibleQuestionIds
// (hidden questions are dropped and never required). `required`: at least
// one question must be answered (the field itself is required).
// Returns { value: <clean grid object or null>, error }.
export function validateQuestionTableValue(field, rawValue, { visibleIds, required = false } = {}) {
  const name = `“${field.label || field.key}”`;
  const grid = parseGrid(rawValue);
  if (grid === null) return { error: `${name}: the answers could not be read, please fill it again` };

  const columns = answerColumnsOf(field);
  const questions = questionsOf(field);
  const clean = {};
  const problems = [];

  for (const q of questions) {
    const qid = String(q.id);
    if (visibleIds && !visibleIds.has(qid)) continue;
    const rawRow = grid[qid] && typeof grid[qid] === "object" ? grid[qid] : {};
    const row = {};
    for (const column of columns) {
      const label = `${name} — ${q.text || qid}${columns.length > 1 ? ` (${column.label || column.key})` : ""}`;
      const result = validateCell(column, rawRow[column.key], label);
      if (result.error) problems.push(result.error);
      else if (result.value !== undefined) row[column.key] = result.value;
    }
    if (q.required && row[MAIN_ANSWER_KEY] === undefined) problems.push(`${name} — “${q.text || qid}” needs an answer`);
    if (Object.keys(row).length > 0) clean[qid] = row;
  }

  if (problems.length > 0) return { error: problems[0] };
  if (Object.keys(clean).length === 0) {
    if (required) return { error: `${name} is required` };
    return { value: null };
  }
  return { value: clean };
}

// Score of a saved grid (only when field.scored): points per answered,
// visible question; max_score = the best possible over the questions that
// could be answered (NA and unscored answer types are left out).
// Returns { score, max_score, answered }.
export function scoreQuestionTable(field, grid, visibleIds = null) {
  const stats = { score: 0, max_score: 0, answered: 0 };
  if (!grid || typeof grid !== "object") return stats;
  const main = mainColumnOf(field);
  for (const q of questionsOf(field)) {
    const qid = String(q.id);
    if (visibleIds && !visibleIds.has(qid)) continue;
    const cell = grid[qid];
    const answer = cell ? cell[MAIN_ANSWER_KEY] : undefined;
    if (answer !== undefined) stats.answered += 1;
    if (!field.scored) continue;

    const points = q.points && typeof q.points === "object" ? q.points : DEFAULT_POINTS[main.type];
    if (!points) continue; // text / number / tick answers have no points
    const values = Object.values(points).map(Number).filter(Number.isFinite);
    if (answer === "NA") continue; // "not applicable" is not counted at all
    if (values.length > 0) stats.max_score += Math.max(...values);
    if (answer !== undefined && Number.isFinite(Number(points[answer]))) stats.score += Number(points[answer]);
  }
  return stats;
}

// Publish check: returns a plain-words message or null.
export function findQuestionTableProblems(field) {
  const name = `“${field.label || field.key}”`;
  const questions = Array.isArray(field.questions) ? field.questions : [];
  if (questions.length === 0) return `${name}: add at least one question.`;
  if (questions.length > MAX_QUESTIONS) return `${name}: a question table can have at most ${MAX_QUESTIONS} questions.`;

  const seen = new Set();
  for (const [index, q] of questions.entries()) {
    if (!q || typeof q !== "object" || q.id == null || !QUESTION_ID_PATTERN.test(String(q.id))) {
      return `${name}: question ${index + 1} couldn't be read. Remove it and add it again.`;
    }
    if (seen.has(String(q.id))) return `${name}: two questions share the same internal id. Remove one and add it again.`;
    seen.add(String(q.id));
    if (isBlank(q.text)) return `${name}: question ${index + 1} has no text.`;
    if (String(q.text).length > 300) return `${name}: question ${index + 1} is too long (at most 300 characters).`;
  }

  const columns = Array.isArray(field.answer_columns) && field.answer_columns.length > 0 ? field.answer_columns : null;
  if (columns) {
    if (columns.length > MAX_COLUMNS) return `${name}: at most ${MAX_COLUMNS} columns.`;
    if (columns[0].key !== MAIN_ANSWER_KEY) return `${name}: the first column must be the main answer.`;
    const keys = new Set();
    for (const [i, c] of columns.entries()) {
      if (!c || !COLUMN_KEY_PATTERN.test(String(c.key))) return `${name}: column ${i + 1} couldn't be read.`;
      if (keys.has(c.key)) return `${name}: two columns share the same key.`;
      keys.add(c.key);
      const allowed = i === 0 ? ANSWER_COLUMN_TYPES : EXTRA_COLUMN_TYPES;
      if (!allowed.includes(c.type)) return `${name}: column ${i + 1} has an answer type that isn't allowed there.`;
      if (isBlank(c.label)) return `${name}: column ${i + 1} needs a heading.`;
    }
  }

  const main = mainColumnOf(field);
  for (const q of questions) {
    if (q.points == null) continue;
    if (typeof q.points !== "object" || Array.isArray(q.points)) return `${name}: the points for “${q.text}” couldn't be read.`;
    const options = CHOICES[main.type] || [];
    for (const [answer, value] of Object.entries(q.points)) {
      if (!options.includes(answer) || !Number.isFinite(Number(value))) {
        return `${name}: the points for “${q.text}” must be numbers for ${options.join(", ") || "the answers"}.`;
      }
    }
  }

  // "Show this question only when ..." rules: rules on another row of this
  // table must point at an EARLIER question (so two questions can never wait
  // for each other); rules on other fields are checked by the normal
  // condition publish check.
  const order = new Map(questions.map((q, i) => [String(q.id), i]));
  for (const [index, q] of questions.entries()) {
    const rules = q.conditions && Array.isArray(q.conditions.rules) ? q.conditions.rules : [];
    for (const rule of rules) {
      if (rule && rule.field === field.key) {
        const at = order.get(String(rule.row));
        if (at == null) return `${name}: the rule on question ${index + 1} uses a question that was deleted.`;
        if (at >= index) return `${name}: a question can only depend on a question ABOVE it (question ${index + 1} depends on question ${at + 1}).`;
      }
    }
  }
  return null;
}

// A saved grid as plain lines for Excel / PDF:
//   1. Is the service in scope? — Yes; Service No.: SP-1
// Only answered questions are listed.
export function questionTableText(field, storedValue) {
  const grid = parseGrid(storedValue);
  if (!grid) return "";
  const columns = answerColumnsOf(field);
  const lines = [];
  questionsOf(field).forEach((q, index) => {
    const row = grid[String(q.id)];
    if (!row) return;
    const parts = columns
      .map((c, i) => (row[c.key] === undefined ? null : i === 0 ? String(row[c.key]) : `${c.label || c.key}: ${row[c.key]}`))
      .filter((p) => p != null);
    if (parts.length) lines.push(`${index + 1}. ${q.text || q.id} — ${parts.join("; ")}`);
  });
  return lines.join("\n");
}
