// Calculation fields (plan items H, O5, O6): a read-only field whose value is
// worked out from a formula over the other fields. Pure module (no DB) — the
// submission service calls applyCalculations once everything else has been
// validated, so the stored number never comes from the client.
//
// Field props:
//   type: "calculation"
//   formula: "[qty] * [rate]"          see formBuilderFormula.js for the syntax
//   result_type: "number" (default) | "date"
//   decimals: 0-4 (default 2)          numbers are rounded to this many places
//   result_ranges: [{ from: 0, label: "Fail" }, { from: 50, label: "Pass" }]
//                                      shown next to the number on screen
//                                      (never stored); see resultLabelFor
// A calculation can sit at the top level or as a column of a repeater (then
// it is worked out for every row, and [column] means "this row's column").
//
// References a formula may use:
//   [key]              a top-level field (empty if it is hidden)
//   [table.column]     a repeater's column across all rows (a list)
//   [checks.score] [checks.max_score] [checks.answered]   a question table's score
//   inside a repeater row: [column] first looks at the same row.

import moment from "moment";
import { evaluateFormula, findFormulaProblem, parseFormula, roundResult } from "./formBuilderFormula.js";
import { LAYOUT_TYPES } from "./formBuilderDdlBuilder.js";

export const RESULT_TYPES = ["number", "date"];
export const MAX_DECIMALS = 4; // DECIMAL(18,4) column
const FILE_TYPES = new Set(["file", "signature", "image"]);
const SCORE_PARTS = ["score", "max_score", "answered"];

export function decimalsOf(field) {
  const d = Number(field?.decimals);
  return Number.isInteger(d) && d >= 0 && d <= MAX_DECIMALS ? d : 2;
}

export function resultTypeOf(field) {
  return field?.result_type === "date" ? "date" : "number";
}

// Label for a number, from the field's result_ranges (highest "from" that the
// number reaches). Used on screen and in exports; never stored.
export function resultLabelFor(field, value) {
  const ranges = Array.isArray(field?.result_ranges) ? field.result_ranges : [];
  if (value == null || !Number.isFinite(Number(value))) return null;
  const sorted = ranges
    .filter((r) => r && Number.isFinite(Number(r.from)) && String(r.label ?? "").trim())
    .sort((a, b) => Number(a.from) - Number(b.from));
  let hit = null;
  for (const r of sorted) if (Number(value) >= Number(r.from)) hit = r;
  return hit ? String(hit.label).trim() : null;
}

function isDataField(f) {
  return f && f.key && !LAYOUT_TYPES.has(f.type) && !FILE_TYPES.has(f.type);
}

// The references a formula may use for a list of fields: for the top level,
// every data field key, repeater columns and question-table score parts; for
// a repeater's row, its own columns plus the top-level keys.
export function allowedRefs(fields, { rowColumns = null } = {}) {
  const refs = new Set();
  for (const f of fields) {
    if (!isDataField(f) && f.type !== "repeater") continue;
    refs.add(f.key);
    if (f.type === "repeater") for (const c of f.columns || []) if (isDataField(c)) refs.add(`${f.key}.${c.key}`);
    if (f.type === "question-table") SCORE_PARTS.forEach((p) => refs.add(`${f.key}.${p}`));
  }
  for (const c of rowColumns || []) if (isDataField(c)) refs.add(c.key);
  return refs;
}

function headOf(ref) {
  return ref.split(".")[0];
}

function refsOf(field) {
  try {
    return parseFormula(field.formula).refs;
  } catch {
    return [];
  }
}

// Top-level calculations split by whether they (directly or through another
// calculation) use a repeater column: those must wait until the rows'
// own calculations are done.
function partitionTopLevel(fields) {
  const calcs = fields.filter((f) => f.type === "calculation");
  const byKey = new Map(calcs.map((f) => [f.key, f]));
  const repeaterKeys = new Set(fields.filter((f) => f.type === "repeater").map((f) => f.key));
  const usesRepeater = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of calcs) {
      if (usesRepeater.has(c.key)) continue;
      const hit = refsOf(c).some((r) => (r.includes(".") && repeaterKeys.has(headOf(r))) || (byKey.has(headOf(r)) && usesRepeater.has(headOf(r))));
      if (hit) {
        usesRepeater.add(c.key);
        changed = true;
      }
    }
  }
  return { calcs, byKey, usesRepeater };
}

// Order calculations so each comes after the ones it uses.
// Returns { order: [fields], cycle: [fields] | null }.
export function orderCalculations(calcs) {
  const byKey = new Map(calcs.map((f) => [f.key, f]));
  const state = new Map();
  const order = [];
  let cycle = null;
  const stack = [];
  function visit(f) {
    if (cycle) return;
    if (state.get(f) === 2) return;
    if (state.get(f) === 1) {
      cycle = stack.slice(stack.indexOf(f));
      return;
    }
    state.set(f, 1);
    stack.push(f);
    for (const ref of refsOf(f)) {
      const dep = byKey.get(headOf(ref));
      if (dep) visit(dep);
      if (cycle) return;
    }
    stack.pop();
    state.set(f, 2);
    order.push(f);
  }
  for (const f of calcs) visit(f);
  return { order: cycle ? [] : order, cycle };
}

const nameOf = (f) => `“${f.label || f.key}”`;

// Publish check for every calculation field (top level and repeater
// columns). Returns a plain-words message or null.
export function findCalculationProblems(fields) {
  const list = Array.isArray(fields) ? fields.filter((f) => f && typeof f === "object") : [];
  const known = allowedRefs(list);
  const check = (f, refsAllowed) => {
    if (f.result_type != null && !RESULT_TYPES.includes(f.result_type)) return `${nameOf(f)}: choose whether the result is a number or a date.`;
    if (f.decimals != null && !(Number.isInteger(Number(f.decimals)) && Number(f.decimals) >= 0 && Number(f.decimals) <= MAX_DECIMALS)) {
      return `${nameOf(f)}: decimals must be between 0 and ${MAX_DECIMALS}.`;
    }
    const problem = findFormulaProblem(f.formula, refsAllowed);
    if (problem) return `${nameOf(f)}: ${problem}`;
    if (refsOf(f).includes(f.key)) return `${nameOf(f)}: a formula can't use its own result.`;
    if (f.result_ranges != null) {
      if (!Array.isArray(f.result_ranges)) return `${nameOf(f)}: the result labels couldn't be read.`;
      for (const r of f.result_ranges) {
        if (!r || !Number.isFinite(Number(r.from)) || !String(r.label ?? "").trim()) return `${nameOf(f)}: every result label needs a number and a name.`;
      }
    }
    return null;
  };

  const topCalcs = list.filter((f) => f.type === "calculation");
  for (const f of topCalcs) {
    const p = check(f, known);
    if (p) return p;
  }
  const { cycle } = orderCalculations(topCalcs);
  if (cycle) return `${cycle.map(nameOf).join(", ")} use each other's results, so none of them can be worked out. Change one formula.`;

  const { usesRepeater } = partitionTopLevel(list);
  for (const rep of list.filter((f) => f.type === "repeater")) {
    const cols = Array.isArray(rep.columns) ? rep.columns.filter((c) => c && typeof c === "object") : [];
    const rowCalcs = cols.filter((c) => c.type === "calculation");
    const rowKnown = allowedRefs(list, { rowColumns: cols });
    for (const c of rowCalcs) {
      const p = check(c, rowKnown);
      if (p) return `${nameOf(rep)}: ${p}`;
      const late = refsOf(c).find((r) => usesRepeater.has(headOf(r)) && !cols.some((col) => col.key === headOf(r)));
      if (late) return `${nameOf(rep)}: ${nameOf(c)} uses [${late}], which itself adds up this table's rows — that would go round in a circle.`;
    }
    const rowCycle = orderCalculations(rowCalcs).cycle;
    if (rowCycle) return `${nameOf(rep)}: ${rowCycle.map(nameOf).join(", ")} use each other's results. Change one formula.`;
  }
  return null;
}

// ---------- Working the values out ----------

function dateTextFor(raw, validated) {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return raw.trim().slice(0, 10);
  if (validated instanceof Date && !Number.isNaN(validated.getTime())) return moment(validated).utcOffset("+05:30").format("YYYY-MM-DD");
  if (typeof validated === "string" && /^\d{4}-\d{2}-\d{2}/.test(validated)) return validated.slice(0, 10);
  return null;
}

function toRefValue(field, validated, raw) {
  if (field.type === "date" || field.type === "datetime") return { type: field.type, value: dateTextFor(raw, validated) };
  return { type: field.type, value: validated };
}

function finalValue(field, result) {
  const rounded = roundResult(result, decimalsOf(field));
  if (resultTypeOf(field) === "date") return rounded.kind === "date" ? rounded.value : null;
  return rounded.kind === "number" ? rounded.value : null;
}

// Fill in every calculation:
//   fields          top-level fields visible to this submitter
//   answers         the submitted answers (raw)
//   visible         Set from evaluateVisibility (hidden calculations stay empty)
//   columns         validated top-level values; calculation results are added here
//   repeaterRowSets validated rows per repeater key ([{ col: value }]); row
//                   calculations are added to each row
//   questionStats   { <table key>: { score, max_score, answered } }
//   stored          the saved row on an edit (values not rewritten are read from it)
//   now             Date (for TODAY() / AGE_YEARS), read in the +05:30 zone
// Mutates `columns` and the row objects; returns nothing.
export function applyCalculations({ fields, answers, visible, columns, repeaterRowSets, questionStats = {}, stored = null, now = new Date() }) {
  const today = moment(now).utcOffset("+05:30").format("YYYY-MM-DD");
  const byKey = new Map(fields.filter((f) => f.key).map((f) => [f.key, f]));
  const safeAnswers = answers && typeof answers === "object" ? answers : {};

  const resolveTop = (name) => {
    const [head, tail] = name.split(".");
    const f = byKey.get(head);
    if (!f) return null;
    if (tail) {
      if (f.type === "repeater") {
        const rows = repeaterRowSets[head] || [];
        const col = (f.columns || []).find((c) => c.key === tail);
        return { type: "list", value: rows.map((r, i) => (col && (col.type === "date" || col.type === "datetime") ? dateTextFor((safeAnswers[head] || [])[i]?.[tail], r[tail]) : r[tail])) };
      }
      if (f.type === "question-table" && SCORE_PARTS.includes(tail)) {
        return { type: "number", value: (questionStats[head] || {})[tail] ?? 0 };
      }
      return null;
    }
    if (!visible.has(head)) return null;
    // On an edit, a value that wasn't rewritten (a locked date) still counts.
    const validated = head in columns ? columns[head] : stored ? stored[head] : undefined;
    return toRefValue(f, validated, safeAnswers[head]);
  };

  const { calcs, usesRepeater } = partitionTopLevel(fields);
  const { order } = orderCalculations(calcs);
  const runTop = (f) => {
    if (!visible.has(f.key)) {
      columns[f.key] = null;
      return;
    }
    columns[f.key] = finalValue(f, evaluateFormula(f.formula, { resolve: resolveTop, today }));
  };

  // 1. top-level calculations that don't wait for the repeater rows
  order.filter((f) => !usesRepeater.has(f.key)).forEach(runTop);

  // 2. every repeater row's own calculations
  for (const rep of fields.filter((f) => f.type === "repeater")) {
    const cols = Array.isArray(rep.columns) ? rep.columns : [];
    const rowCalcs = cols.filter((c) => c.type === "calculation");
    if (rowCalcs.length === 0) continue;
    const { order: rowOrder } = orderCalculations(rowCalcs);
    (repeaterRowSets[rep.key] || []).forEach((rowCols, i) => {
      const rawRow = (safeAnswers[rep.key] || [])[i] || {};
      const resolveRow = (name) => {
        if (!name.includes(".")) {
          const col = cols.find((c) => c.key === name);
          if (col) return toRefValue(col, rowCols[name], rawRow[name]);
        }
        return resolveTop(name);
      };
      for (const c of rowOrder) {
        rowCols[c.key] = finalValue(c, evaluateFormula(c.formula, { resolve: resolveRow, today }));
      }
    });
  }

  // 3. top-level calculations that add up the rows
  order.filter((f) => usesRepeater.has(f.key)).forEach(runTop);
}
