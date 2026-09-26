import { getPath, resolveTemplate } from "./context.js";

// Rule operators shared by trigger filters, Condition and If/Else nodes.
// Rule shape: { field: "record.contact_status", operator: "equals", value: "3" }

const toNum = (v) => (v === "" || v == null ? NaN : Number(v));
const toStr = (v) => (v == null ? "" : String(v)).toLowerCase();
const toList = (v) =>
  Array.isArray(v) ? v.map(toStr) : toStr(v).split(",").map((s) => s.trim()).filter(Boolean);

const OPERATORS = {
  equals: (a, b) => toStr(a) === toStr(b),
  not_equals: (a, b) => toStr(a) !== toStr(b),
  contains: (a, b) => toStr(a).includes(toStr(b)),
  not_contains: (a, b) => !toStr(a).includes(toStr(b)),
  starts_with: (a, b) => toStr(a).startsWith(toStr(b)),
  ends_with: (a, b) => toStr(a).endsWith(toStr(b)),
  greater_than: (a, b) => toNum(a) > toNum(b),
  less_than: (a, b) => toNum(a) < toNum(b),
  greater_than_or_equal: (a, b) => toNum(a) >= toNum(b),
  less_than_or_equal: (a, b) => toNum(a) <= toNum(b),
  is_empty: (a) => a == null || toStr(a).trim() === "",
  is_not_empty: (a) => !(a == null || toStr(a).trim() === ""),
  in: (a, b) => toList(b).includes(toStr(a)),
  not_in: (a, b) => !toList(b).includes(toStr(a)),
  contains_any: (a, b) => toList(b).some((x) => toStr(a).includes(x)),
  changed: (a, b, ctx, rule) => Array.isArray(ctx?.changed_fields) && ctx.changed_fields.includes(fieldName(rule.field)),
  changed_to: (a, b, ctx, rule) =>
    Array.isArray(ctx?.changed_fields) && ctx.changed_fields.includes(fieldName(rule.field)) && toStr(a) === toStr(b),
  changed_from: (a, b, ctx, rule) =>
    Array.isArray(ctx?.changed_fields) &&
    ctx.changed_fields.includes(fieldName(rule.field)) &&
    toStr(getPath(ctx, `before.${fieldName(rule.field)}`)) === toStr(b),
};

const fieldName = (path) => String(path || "").split(".").pop();

export const OPERATOR_NAMES = Object.keys(OPERATORS);

export const evaluateRule = (rule, ctx) => {
  const op = OPERATORS[rule?.operator];
  if (!op) return false;
  const left = getPath(ctx, rule.field);
  const right = resolveTemplate(rule.value, ctx);
  try {
    return !!op(left, right, ctx, rule);
  } catch {
    return false;
  }
};

/** rules: [...], match: "AND" | "OR". Empty rules = true. */
export const evaluateRules = (rules, match, ctx) => {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  return String(match || "AND").toUpperCase() === "OR"
    ? rules.some((r) => evaluateRule(r, ctx))
    : rules.every((r) => evaluateRule(r, ctx));
};
