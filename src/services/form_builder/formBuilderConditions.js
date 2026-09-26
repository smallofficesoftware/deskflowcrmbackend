// Conditional (dependent) fields — Form Builder v2 items D2, D3, D5, D6, D7.
// Pure module: no DB, no imports. The frontend keeps a line-for-line copy of
// this logic and both sides run the same fixtures
// (formBuilderConditions.fixtures.json), so "what is visible / required"
// never differs between the fill screen and the server.
//
// Field props (inside schema_json, no DB change):
//   conditions          { match: "all" | "any", rules: [Rule, ...] }  "Show this only when ..."
//   required_conditions { match: "all" | "any", rules: [Rule, ...] }  "Required only when ..."
//   Rule = { field: <key>, op, value?, row? }
//     op: is | is_not | is_empty | is_not_empty | contains | gt | lt | any_of
//     row: question-table row id (reserved for Phase 6 — see readRowValue)
// Missing / empty rules list = no condition (always shown / never
// conditionally required). `conditions` on a section-header hides every
// field after it up to the next section-header.
//
// Rules of evaluation (the fixtures pin every one of these down):
//   - A rule that points at a HIDDEN field is false, whatever its operator —
//     so a field depending on a hidden field is hidden too (for match "all";
//     with match "any" another true rule can still show it).
//   - A rule that points at a field that doesn't exist is false (publish
//     rejects such forms, see findConditionProblems).
//   - A circular chain met at fill time counts as hidden (publish rejects it).
//   - is / is_not: numbers compared as numbers ("5" is 5.0); true/false and
//     "true"/"false" compare as 1/0 (checkbox / switch); everything else is a
//     trimmed, case-insensitive text compare. On a multi-select answer (an
//     array) "is" means "one of the ticked options is".
//   - is_empty: null, "", [], {} — and for checkbox / switch also unticked
//     (false / 0 / "0" / "false").
//   - contains: multi-select -> one ticked option equals the value; text ->
//     case-insensitive substring.
//   - gt / lt: numbers; date / datetime fields (or two YYYY-MM-DD values)
//     compared as dates. Empty or non-numeric -> false.
//   - any_of: value is a list; true when the answer (or any ticked option of
//     a multi-select) equals one of them.
//
// Repeater sub-fields: evaluate them per row with the row as `answers` and
// the top level passed as `outer` ({ fields, answers, visible }) — a rule
// first looks for a sub-field of the same row, then for a top-level field.

export const CONDITION_OPERATORS = ["is", "is_not", "is_empty", "is_not_empty", "contains", "gt", "lt", "any_of"];
const OPERATOR_SET = new Set(CONDITION_OPERATORS);

// Types that can't be the SOURCE of a rule: layout (no value), uploads
// (not part of the answers), repeater (a list of rows, not one value).
const NON_SOURCE_TYPES = new Set(["section-header", "instruction", "file", "signature", "image", "repeater"]);
const BOOLEAN_TYPES = new Set(["checkbox", "switch"]);
const DATE_TYPES = new Set(["date", "datetime"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([ T].*)?$/;

function hasRules(group) {
  return !!group && Array.isArray(group.rules) && group.rules.length > 0;
}

function isBlank(value) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Date) return Number.isNaN(value.getTime());
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function isUnticked(value) {
  return value === false || value === 0 || value === "0" || String(value).toLowerCase() === "false";
}

// A multi-select answer may arrive as an array, or as its stored JSON text.
function asList(field, value) {
  if (Array.isArray(value)) return value;
  if (field?.type === "multi-select" && typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* not JSON — treat as a plain value */
    }
  }
  return null;
}

function normalizeScalar(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return 1;
    if (lower === "false") return 0;
  }
  return value;
}

function toNumber(value) {
  if (value == null || value === "" || typeof value === "object") return null;
  const num = Number(normalizeScalar(value));
  return Number.isFinite(num) ? num : null;
}

function scalarEquals(a, b) {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na != null && nb != null) return na === nb;
  if (a == null || b == null) return a == null && b == null;
  return String(normalizeScalar(a)).trim().toLowerCase() === String(normalizeScalar(b)).trim().toLowerCase();
}

function toTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) return null;
  const t = new Date(value.trim().length === 10 ? `${value.trim()}T00:00:00` : value.trim()).getTime();
  return Number.isNaN(t) ? null : t;
}

function compare(field, actual, expected) {
  if (DATE_TYPES.has(field?.type) || (toTime(actual) != null && toTime(expected) != null)) {
    const ta = toTime(actual);
    const te = toTime(expected);
    if (ta == null || te == null) return null;
    return ta - te;
  }
  const na = toNumber(actual);
  const ne = toNumber(expected);
  if (na == null || ne == null) return null;
  return na - ne;
}

// Question-table single-row target (Phase 6 decides the grid's storage
// shape; this accepts both { rowId: answer } and [{ id, answer|value }]).
function readRowValue(value, row) {
  if (value == null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    const hit = value.find((r) => r && String(r.id ?? r.row) === String(row));
    if (!hit) return null;
    return hit.answer !== undefined ? hit.answer : hit.value;
  }
  const cell = value[row];
  if (cell && typeof cell === "object" && !Array.isArray(cell)) return cell.answer !== undefined ? cell.answer : cell.value;
  return cell === undefined ? null : cell;
}

// One rule against an already-resolved source { field, value }.
export function evaluateRule(rule, source) {
  if (!rule || !OPERATOR_SET.has(rule.op)) return false;
  const field = source.field;
  let value = source.value;
  if (rule.row != null && rule.row !== "") value = readRowValue(value, rule.row);
  const list = asList(field, value);

  const empty = isBlank(list ?? value) || (BOOLEAN_TYPES.has(field?.type) && isUnticked(value));

  switch (rule.op) {
    case "is_empty":
      return empty;
    case "is_not_empty":
      return !empty;
    case "is":
      if (list) return list.some((v) => scalarEquals(v, rule.value));
      if (BOOLEAN_TYPES.has(field?.type)) return scalarEquals(empty ? 0 : 1, rule.value);
      return !isBlank(value) && scalarEquals(value, rule.value);
    case "is_not":
      if (list) return !list.some((v) => scalarEquals(v, rule.value));
      if (BOOLEAN_TYPES.has(field?.type)) return !scalarEquals(empty ? 0 : 1, rule.value);
      return isBlank(value) || !scalarEquals(value, rule.value);
    case "contains": {
      if (rule.value == null || rule.value === "") return false;
      if (list) return list.some((v) => scalarEquals(v, rule.value));
      if (isBlank(value)) return false;
      return String(value).toLowerCase().includes(String(rule.value).toLowerCase());
    }
    case "gt":
    case "lt": {
      if (empty) return false;
      const diff = compare(field, value, rule.value);
      if (diff == null) return false;
      return rule.op === "gt" ? diff > 0 : diff < 0;
    }
    case "any_of": {
      const options = Array.isArray(rule.value) ? rule.value : rule.value == null ? [] : [rule.value];
      if (options.length === 0 || empty) return false;
      const answers = list || [BOOLEAN_TYPES.has(field?.type) ? 1 : value];
      return answers.some((a) => options.some((o) => scalarEquals(a, o)));
    }
    default:
      return false;
  }
}

function evaluateGroup(group, lookup) {
  if (!hasRules(group)) return true;
  const results = group.rules.map((rule) => {
    const source = lookup(rule?.field);
    if (!source || source.hidden || source.missing) return false;
    return evaluateRule(rule, source);
  });
  return group.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

// One rule group against a plain list of top-level fields (used for rules
// that are not part of a field's own conditions, e.g. a question-table row's
// "show this question only when ..."). `visibleSet` = the visible keys from
// evaluateVisibility; a rule on a hidden or missing field is false.
export function evaluateConditionGroup(group, fields, answers, visibleSet) {
  const byKey = keyMap(Array.isArray(fields) ? fields : []);
  const values = answers && typeof answers === "object" ? answers : {};
  return evaluateGroup(group, (key) => {
    const f = key != null ? byKey.get(key) : null;
    if (!f || NON_SOURCE_TYPES.has(f.type)) return { missing: true };
    if (!(visibleSet instanceof Set) || !visibleSet.has(key)) return { hidden: true };
    return { field: f, value: values[key] };
  });
}

// field -> the section-header it sits under (top-level lists only).
function sectionMap(fields) {
  const map = new Map();
  let current = null;
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    if (f.type === "section-header") {
      current = f;
      continue;
    }
    if (current) map.set(f, current);
  }
  return map;
}

function keyMap(fields) {
  const map = new Map();
  for (const f of fields) {
    if (f && f.key && !map.has(f.key)) map.set(f.key, f);
  }
  return map;
}

// Set of keys of every visible field (layout fields included when they
// have a key). outer: { fields, answers, visible } for repeater rows.
export function evaluateVisibility(fields, answers, outer = null) {
  const list = Array.isArray(fields) ? fields.filter((f) => f && typeof f === "object") : [];
  const values = answers && typeof answers === "object" ? answers : {};
  const byKey = keyMap(list);
  const sections = sectionMap(list);
  const outerByKey = outer ? keyMap(Array.isArray(outer.fields) ? outer.fields : []) : null;
  const state = new Map(); // field -> "visiting" | true | false

  function lookup(key) {
    if (key != null && byKey.has(key)) {
      const f = byKey.get(key);
      if (NON_SOURCE_TYPES.has(f.type)) return { missing: true };
      if (!isVisible(f)) return { hidden: true };
      return { field: f, value: values[key] };
    }
    if (outerByKey && key != null && outerByKey.has(key)) {
      const f = outerByKey.get(key);
      if (NON_SOURCE_TYPES.has(f.type)) return { missing: true };
      if (!(outer.visible instanceof Set) || !outer.visible.has(key)) return { hidden: true };
      return { field: f, value: (outer.answers || {})[key] };
    }
    return { missing: true };
  }

  function isVisible(field) {
    if (state.has(field)) {
      const s = state.get(field);
      return s === "visiting" ? false : s;
    }
    state.set(field, "visiting");
    let visible = true;
    const section = sections.get(field);
    if (section && !isVisible(section)) visible = false;
    if (visible) visible = evaluateGroup(field.conditions, lookup);
    state.set(field, visible);
    return visible;
  }

  const visibleKeys = new Set();
  for (const f of list) {
    if (isVisible(f) && f.key) visibleKeys.add(f.key);
  }
  return visibleKeys;
}

// Is this field required right now? Only a visible field can be required;
// then it is when `required` is set or its required_conditions are met.
// options.fields: the list the field belongs to (gives rule sources their
// type — without it, values are compared type-blind); options.outer: as in
// evaluateVisibility, for repeater sub-fields.
export function isRequired(field, answers, visibleSet, options = {}) {
  if (!field || !field.key || !(visibleSet instanceof Set) || !visibleSet.has(field.key)) return false;
  if (field.required) return true;
  if (!hasRules(field.required_conditions)) return false;

  const values = answers && typeof answers === "object" ? answers : {};
  const byKey = keyMap(Array.isArray(options.fields) ? options.fields : []);
  const outer = options.outer || null;
  const outerByKey = outer ? keyMap(Array.isArray(outer.fields) ? outer.fields : []) : null;

  const lookup = (key) => {
    if (key == null) return { missing: true };
    if (byKey.has(key) || (!outerByKey?.has(key) && key in values)) {
      const f = byKey.get(key) || { key };
      if (NON_SOURCE_TYPES.has(f.type)) return { missing: true };
      if (!visibleSet.has(key)) return { hidden: true };
      return { field: f, value: values[key] };
    }
    if (outerByKey && outerByKey.has(key)) {
      const f = outerByKey.get(key);
      if (NON_SOURCE_TYPES.has(f.type)) return { missing: true };
      if (!(outer.visible instanceof Set) || !outer.visible.has(key)) return { hidden: true };
      return { field: f, value: (outer.answers || {})[key] };
    }
    return { missing: true };
  };
  return evaluateGroup(field.required_conditions, lookup);
}

// ---------- Publish-time checks (D7) ----------

function nameOf(field, parentLabel) {
  const own = `“${field.label || field.key || "Untitled field"}”`;
  return parentLabel ? `${own} (in “${parentLabel}”)` : own;
}

// Problems in one list's rules: unknown operator, missing / unusable source
// field. scopeFields = the list itself; outerFields = top level (for a
// repeater's sub-fields).
function ruleProblems(fields, outerFields, parentLabel) {
  const byKey = keyMap(fields);
  const outerByKey = keyMap(outerFields || []);
  for (const field of fields) {
    for (const [prop, what] of [
      ["conditions", "“Show only when”"],
      ["required_conditions", "“Required only when”"],
    ]) {
      const group = field[prop];
      if (group == null) continue;
      if (typeof group !== "object" || (group.rules != null && !Array.isArray(group.rules))) {
        return `${nameOf(field, parentLabel)} has a ${what} rule that couldn't be read. Open the field and set the rule again.`;
      }
      if (group.match != null && group.match !== "all" && group.match !== "any") {
        return `${nameOf(field, parentLabel)} has a ${what} rule that couldn't be read. Open the field and set the rule again.`;
      }
      for (const rule of group.rules || []) {
        if (!rule || typeof rule !== "object" || !OPERATOR_SET.has(rule.op)) {
          return `${nameOf(field, parentLabel)} has a ${what} rule that couldn't be read. Open the field and set the rule again.`;
        }
        const source = byKey.get(rule.field) || outerByKey.get(rule.field);
        if (!source) {
          const repeater = [...fields, ...(outerFields || [])].find(
            (f) => f.type === "repeater" && (f.columns || []).some((c) => c && c.key === rule.field),
          );
          if (repeater) {
            return `${nameOf(field, parentLabel)} has a ${what} rule that uses a field inside ${nameOf(repeater)}. A rule can only use fields of the same row or fields outside the repeating rows.`;
          }
          return `${nameOf(field, parentLabel)} has a ${what} rule that uses a field that was deleted. Open the field and fix or remove that rule.`;
        }
        if (NON_SOURCE_TYPES.has(source.type)) {
          return `${nameOf(field, parentLabel)} has a ${what} rule that uses ${nameOf(source)}, which can't be used in a rule. Pick a different field.`;
        }
        if (source === field) {
          return `${nameOf(field, parentLabel)} has a ${what} rule that uses itself. Pick a different field.`;
        }
        if (rule.op === "any_of" && (!Array.isArray(rule.value) || rule.value.length === 0)) {
          return `${nameOf(field, parentLabel)} has an “is any of” rule with nothing picked. Pick at least one value.`;
        }
      }
    }
  }
  return null;
}

// Cycle in "shown only when" dependencies (plus the implicit "a field
// depends on its section" edge). Required-only-when rules never change
// visibility, so they can't form a cycle.
function cycleProblem(fields, parentLabel) {
  const byKey = keyMap(fields);
  const sections = sectionMap(fields);
  const deps = new Map();
  for (const f of fields) {
    const list = [];
    const section = sections.get(f);
    if (section) list.push(section);
    for (const rule of f.conditions?.rules || []) {
      const src = byKey.get(rule?.field);
      if (src) list.push(src);
    }
    deps.set(f, list);
  }

  const color = new Map(); // 1 = on stack, 2 = done
  const stack = [];
  let found = null;
  function visit(f) {
    if (found) return;
    color.set(f, 1);
    stack.push(f);
    for (const d of deps.get(f) || []) {
      if (found) return;
      if (color.get(d) === 1) {
        found = stack.slice(stack.indexOf(d));
        return;
      }
      if (!color.get(d)) visit(d);
    }
    stack.pop();
    color.set(f, 2);
  }
  for (const f of fields) {
    if (!color.get(f)) visit(f);
    if (found) break;
  }
  if (!found) return null;
  const names = found.map((f) => nameOf(f, parentLabel));
  if (names.length === 1) {
    return `${names[0]} depends on itself through its “Show only when” rule, so it could never appear. Change the rule.`;
  }
  return `${names.join(", ")} depend on each other through their “Show only when” rules, so they could never appear. Remove one of those rules.`;
}

// Publish check (D7): returns a plain-words message naming field labels, or
// null when every rule is fine. Covers top level and each repeater's rows.
export function findConditionProblems(fields) {
  const list = Array.isArray(fields) ? fields.filter((f) => f && typeof f === "object") : [];
  const top = ruleProblems(list, null, null) || cycleProblem(list, null);
  if (top) return top;
  for (const f of list) {
    if (f.type !== "repeater") continue;
    const cols = Array.isArray(f.columns) ? f.columns.filter((c) => c && typeof c === "object") : [];
    const problem = ruleProblems(cols, list, f.label || f.key) || cycleProblem(cols, f.label || f.key);
    if (problem) return problem;
  }
  return null;
}
