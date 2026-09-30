// Safe formula engine for Calculation fields (plan items H, O5, O6).
// Pure module: no DB, no imports, and NO eval / new Function — a formula is
// tokenised and parsed by hand into a small tree and walked by this file
// only, so a formula can never run anything but the operations below. The
// frontend keeps a line-for-line copy (formula.ts) and both sides run the
// same cases (formBuilderFormula.fixtures.json), so the number shown on the
// fill screen always matches the one the server stores.
//
// Syntax (what the builder types, or builds by clicking):
//   numbers        12   0.5
//   a field        [qty]           value of the field with key "qty"
//   a table column [items.amount]  every row's "amount" of repeater "items"
//                                  (a list — use it inside SUM / MIN / MAX / AVG / COUNT)
//   a score        [checks.score]  virtual references of a question table:
//                  .score  .max_score  .answered   (see formBuilderQuestionTable.js)
//   operators      + - * / %   ( )   and unary minus
//   comparisons    >  <  >=  <=  =  !=   (give 1 when true, 0 when false)
//   functions      SUM MIN MAX AVG COUNT ROUND ABS IF ADD_DAYS DAYS_BETWEEN AGE_YEARS TODAY
//                  IF(cond, a, b)  ROUND(x)  ROUND(x, 2)  ADD_DAYS(date, 7)
//                  DAYS_BETWEEN(from, to)  AGE_YEARS(birth_date)
//
// Values are numbers, dates (whole days) or lists of numbers. An empty field
// counts as 0 in arithmetic, and as "no date" for date functions. Dividing by
// zero (or any other error) makes the result empty (null) rather than a
// wrong number. date + days = date; date - date = days.

export class FormulaError extends Error {}

export const FORMULA_FUNCTIONS = ["SUM", "MIN", "MAX", "AVG", "COUNT", "ROUND", "ABS", "IF", "ADD_DAYS", "DAYS_BETWEEN", "AGE_YEARS", "TODAY"];
const FUNCTION_SET = new Set(FORMULA_FUNCTIONS);
const MAX_FORMULA_LENGTH = 500;
const MAX_DEPTH = 30;
const REF_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/;
const DAY_MS = 86400000;

// ---------- Tokeniser ----------

function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] || ""))) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j])) j++;
      const text = source.slice(i, j);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) throw new FormulaError(`"${text}" isn't a number I can read.`);
      tokens.push({ type: "num", value: Number(text), pos: i });
      i = j;
      continue;
    }
    if (ch === "[") {
      const end = source.indexOf("]", i);
      if (end === -1) throw new FormulaError("A field name is missing its closing ].");
      const name = source.slice(i + 1, end).trim().toLowerCase();
      if (!REF_PATTERN.test(name)) throw new FormulaError(`[${source.slice(i + 1, end)}] isn't a valid field name.`);
      tokens.push({ type: "ref", value: name, pos: i });
      i = end + 1;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[a-zA-Z0-9_]/.test(source[j])) j++;
      tokens.push({ type: "func", value: source.slice(i, j).toUpperCase(), pos: i });
      i = j;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (two === ">=" || two === "<=" || two === "!=" || two === "<>") {
      tokens.push({ type: "op", value: two === "<>" ? "!=" : two, pos: i });
      i += 2;
      continue;
    }
    if ("+-*/%()<>=,".includes(ch)) {
      tokens.push({ type: "op", value: ch, pos: i });
      i++;
      continue;
    }
    throw new FormulaError(`"${ch}" can't be used in a formula.`);
  }
  return tokens;
}

// ---------- Parser (recursive descent) ----------
//   comparison := additive ( (> < >= <= = !=) additive )?
//   additive   := term ( (+|-) term )*
//   term       := unary ( (*|/|%) unary )*
//   unary      := (-|+) unary | primary
//   primary    := number | [ref] | FUNC ( args ) | ( comparison )

function parseTokens(tokens) {
  let index = 0;
  const peek = () => tokens[index];
  const isOp = (value) => peek() && peek().type === "op" && peek().value === value;
  const take = () => tokens[index++];
  const expectOp = (value, message) => {
    if (!isOp(value)) throw new FormulaError(message);
    index++;
  };

  function comparison(depth) {
    let left = additive(depth);
    const t = peek();
    if (t && t.type === "op" && [">", "<", ">=", "<=", "=", "!="].includes(t.value)) {
      index++;
      left = { kind: "cmp", op: t.value, left, right: additive(depth) };
    }
    return left;
  }

  function additive(depth) {
    let left = term(depth);
    while (isOp("+") || isOp("-")) {
      const op = take().value;
      left = { kind: "bin", op, left, right: term(depth) };
    }
    return left;
  }

  function term(depth) {
    let left = unary(depth);
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = take().value;
      left = { kind: "bin", op, left, right: unary(depth) };
    }
    return left;
  }

  function unary(depth) {
    if (isOp("-")) {
      index++;
      return { kind: "neg", operand: unary(depth) };
    }
    if (isOp("+")) {
      index++;
      return unary(depth);
    }
    return primary(depth);
  }

  function primary(depth) {
    if (depth > MAX_DEPTH) throw new FormulaError("This formula is nested too deeply.");
    const t = take();
    if (!t) throw new FormulaError("The formula ends too early — something is missing after the last symbol.");
    if (t.type === "num") return { kind: "num", value: t.value };
    if (t.type === "ref") return { kind: "ref", name: t.value };
    if (t.type === "func") {
      if (!FUNCTION_SET.has(t.value)) throw new FormulaError(`${t.value} isn't a function I know. Use ${FORMULA_FUNCTIONS.join(", ")}.`);
      expectOp("(", `${t.value} must be followed by ( — for example ${t.value}(…).`);
      const args = [];
      if (!isOp(")")) {
        args.push(comparison(depth + 1));
        while (isOp(",")) {
          index++;
          args.push(comparison(depth + 1));
        }
      }
      expectOp(")", `${t.value}( is missing its closing ).`);
      return { kind: "call", name: t.value, args };
    }
    if (t.type === "op" && t.value === "(") {
      const inner = comparison(depth + 1);
      expectOp(")", "A ( is missing its closing ).");
      return inner;
    }
    throw new FormulaError(`Unexpected "${t.value}" in the formula.`);
  }

  const ast = comparison(0);
  if (index < tokens.length) throw new FormulaError(`Unexpected "${tokens[index].value}" in the formula.`);
  return ast;
}

function collectRefs(node, out) {
  if (!node) return;
  if (node.kind === "ref") out.add(node.name);
  if (node.left) collectRefs(node.left, out);
  if (node.right) collectRefs(node.right, out);
  if (node.operand) collectRefs(node.operand, out);
  if (node.args) node.args.forEach((a) => collectRefs(a, out));
}

const ARG_COUNTS = {
  SUM: [1, Infinity],
  MIN: [1, Infinity],
  MAX: [1, Infinity],
  AVG: [1, Infinity],
  COUNT: [1, Infinity],
  ROUND: [1, 2],
  ABS: [1, 1],
  IF: [3, 3],
  ADD_DAYS: [2, 2],
  DAYS_BETWEEN: [2, 2],
  AGE_YEARS: [1, 2],
  TODAY: [0, 0],
};

function checkCalls(node) {
  if (!node) return;
  if (node.kind === "call") {
    const [min, max] = ARG_COUNTS[node.name];
    if (node.args.length < min || node.args.length > max) {
      const want = min === max ? `${min}` : max === Infinity ? `at least ${min}` : `${min} or ${max}`;
      throw new FormulaError(`${node.name} needs ${want} value${max === 1 && min === 1 ? "" : "s"}, but has ${node.args.length}.`);
    }
    node.args.forEach(checkCalls);
    return;
  }
  if (node.left) checkCalls(node.left);
  if (node.right) checkCalls(node.right);
  if (node.operand) checkCalls(node.operand);
}

// Parse once, reuse: returns { ast, refs } or throws FormulaError.
export function parseFormula(source) {
  const text = String(source ?? "").trim();
  if (!text) throw new FormulaError("Type a formula, for example [qty] * [rate].");
  if (text.length > MAX_FORMULA_LENGTH) throw new FormulaError(`The formula is too long (at most ${MAX_FORMULA_LENGTH} characters).`);
  const ast = parseTokens(tokenize(text));
  checkCalls(ast);
  const refs = new Set();
  collectRefs(ast, refs);
  return { ast, refs: [...refs] };
}

// Publish-time check: parses, and every [reference] must be in knownRefs
// (a Set of allowed reference names). Returns a plain message or null.
export function findFormulaProblem(source, knownRefs = null) {
  try {
    const { refs } = parseFormula(source);
    if (knownRefs) {
      const missing = refs.find((r) => !knownRefs.has(r));
      if (missing) return `[${missing}] isn't a field on this form (it may have been deleted or renamed).`;
    }
    return null;
  } catch (e) {
    if (e instanceof FormulaError) return e.message;
    throw e;
  }
}

// ---------- Values ----------
// Runtime values: { t: "n", v: number } | { t: "d", v: <day number> } |
// { t: "list", v: [numbers] } | null (empty). Days are whole days since
// 1970-01-01 (UTC), so no time zone can shift a date.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

export function dayNumberFromString(text) {
  const m = DATE_PATTERN.exec(String(text ?? "").trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = Math.round(ms / DAY_MS);
  // Reject impossible dates such as 2026-02-31 (Date.UTC would roll over).
  return dayNumberToString(day) === `${m[1]}-${m[2]}-${m[3]}` ? day : null;
}

export function dayNumberToString(day) {
  const d = new Date(day * DAY_MS);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function toNumberValue(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "boolean") return { t: "n", v: raw ? 1 : 0 };
  const num = Number(raw);
  return Number.isFinite(num) ? { t: "n", v: num } : null;
}

// How a reference is turned into a runtime value from what the caller
// gives back: { value, type } — type is the field's type ("date", "number"…)
// or "list" for a table column.
function refValue(resolved) {
  if (!resolved) return null;
  const { value, type } = resolved;
  if (type === "list") {
    const list = (Array.isArray(value) ? value : []).map((x) => {
      const n = toNumberValue(x);
      return n ? n.v : null;
    });
    return { t: "list", v: list };
  }
  if (type === "date" || type === "datetime") {
    const day = dayNumberFromString(value instanceof Date ? value.toISOString() : value);
    return day == null ? null : { t: "d", v: day };
  }
  return toNumberValue(value);
}

function asNumber(value) {
  if (value == null) return 0;
  if (value.t === "n" || value.t === "d") return value.v;
  throw new FormulaError("A list of values can only be used inside SUM, MIN, MAX, AVG or COUNT.");
}

function listOf(value) {
  if (value == null) return [];
  if (value.t === "list") return value.v.filter((x) => x != null);
  return [value.v];
}

function flatNumbers(args) {
  return args.flatMap(listOf);
}

function evalNode(node, ctx) {
  switch (node.kind) {
    case "num":
      return { t: "n", v: node.value };
    case "ref":
      return refValue(ctx.resolve(node.name));
    case "neg": {
      const v = evalNode(node.operand, ctx);
      return { t: "n", v: -asNumber(v) };
    }
    case "cmp": {
      const a = asNumber(evalNode(node.left, ctx));
      const b = asNumber(evalNode(node.right, ctx));
      const result = { ">": a > b, "<": a < b, ">=": a >= b, "<=": a <= b, "=": a === b, "!=": a !== b }[node.op];
      return { t: "n", v: result ? 1 : 0 };
    }
    case "bin": {
      const left = evalNode(node.left, ctx);
      const right = evalNode(node.right, ctx);
      const a = asNumber(left);
      const b = asNumber(right);
      const leftDate = left && left.t === "d";
      const rightDate = right && right.t === "d";
      if (node.op === "+") return leftDate || rightDate ? { t: "d", v: a + b } : { t: "n", v: a + b };
      if (node.op === "-") {
        if (leftDate && rightDate) return { t: "n", v: a - b }; // days between
        return leftDate ? { t: "d", v: a - b } : { t: "n", v: a - b };
      }
      if (leftDate || rightDate) throw new FormulaError("Dates can only be added to or subtracted from.");
      if (node.op === "*") return { t: "n", v: a * b };
      if (b === 0) throw new FormulaError("Division by zero.");
      if (node.op === "/") return { t: "n", v: a / b };
      return { t: "n", v: a % b };
    }
    case "call":
      return evalCall(node, ctx);
    default:
      throw new FormulaError("The formula couldn't be read.");
  }
}

function evalCall(node, ctx) {
  const name = node.name;
  if (name === "IF") {
    // Only the chosen branch is evaluated.
    const cond = asNumber(evalNode(node.args[0], ctx));
    return evalNode(node.args[cond !== 0 ? 1 : 2], ctx);
  }
  const args = node.args.map((a) => evalNode(a, ctx));
  switch (name) {
    case "SUM":
      return { t: "n", v: flatNumbers(args).reduce((s, x) => s + x, 0) };
    case "COUNT":
      return { t: "n", v: flatNumbers(args).length };
    case "AVG": {
      const nums = flatNumbers(args);
      if (nums.length === 0) throw new FormulaError("Nothing to average.");
      return { t: "n", v: nums.reduce((s, x) => s + x, 0) / nums.length };
    }
    case "MIN":
    case "MAX": {
      const nums = flatNumbers(args);
      if (nums.length === 0) return null;
      return { t: "n", v: name === "MIN" ? Math.min(...nums) : Math.max(...nums) };
    }
    case "ABS":
      return { t: "n", v: Math.abs(asNumber(args[0])) };
    case "ROUND": {
      const digits = args[1] ? Math.trunc(asNumber(args[1])) : 0;
      if (digits < 0 || digits > 8) throw new FormulaError("ROUND can keep 0 to 8 decimals.");
      const factor = 10 ** digits;
      return { t: "n", v: Math.round((asNumber(args[0]) + Number.EPSILON) * factor) / factor };
    }
    case "ADD_DAYS": {
      if (args[0] == null || args[0].t !== "d") return null; // no date yet
      return { t: "d", v: args[0].v + Math.trunc(asNumber(args[1])) };
    }
    case "DAYS_BETWEEN": {
      if (!args[0] || !args[1] || args[0].t !== "d" || args[1].t !== "d") return null;
      return { t: "n", v: args[1].v - args[0].v };
    }
    case "AGE_YEARS": {
      const birth = args[0];
      if (!birth || birth.t !== "d") return null;
      const asOf = args[1] ? args[1] : ctx.today != null ? { t: "d", v: ctx.today } : null;
      if (!asOf || asOf.t !== "d") return null;
      const b = new Date(birth.v * DAY_MS);
      const o = new Date(asOf.v * DAY_MS);
      let years = o.getUTCFullYear() - b.getUTCFullYear();
      const beforeBirthday = o.getUTCMonth() < b.getUTCMonth() || (o.getUTCMonth() === b.getUTCMonth() && o.getUTCDate() < b.getUTCDate());
      if (beforeBirthday) years -= 1;
      return { t: "n", v: years };
    }
    case "TODAY":
      if (ctx.today == null) return null;
      return { t: "d", v: ctx.today };
    default:
      throw new FormulaError(`${name} isn't a function I know.`);
  }
}

// Evaluate a formula.
//   options.resolve(refName) -> { value, type } | null
//       type: the field's type ("number", "date", ...) or "list" for a
//       [table.column] reference (value = array of the rows' values)
//   options.today  -> "YYYY-MM-DD" used by TODAY() / AGE_YEARS
// Returns { value, kind }:
//   kind "number" -> value is a number (not rounded — see roundResult)
//   kind "date"   -> value is "YYYY-MM-DD"
//   kind null     -> value is null (empty result, or an error such as
//                    dividing by zero; `error` holds the plain message)
export function evaluateFormula(source, options = {}) {
  let parsed;
  try {
    parsed = parseFormula(source);
  } catch (e) {
    if (e instanceof FormulaError) return { value: null, kind: null, error: e.message };
    throw e;
  }
  const today = options.today ? dayNumberFromString(options.today) : null;
  const ctx = { resolve: options.resolve || (() => null), today };
  try {
    const result = evalNode(parsed.ast, ctx);
    if (result == null) return { value: null, kind: null };
    if (result.t === "list") return { value: null, kind: null, error: "The formula ends in a list — wrap it in SUM, MIN, MAX, AVG or COUNT." };
    if (!Number.isFinite(result.v)) return { value: null, kind: null, error: "The result isn't a number." };
    if (result.t === "d") return { value: dayNumberToString(result.v), kind: "date" };
    return { value: result.v, kind: "number" };
  } catch (e) {
    if (e instanceof FormulaError) return { value: null, kind: null, error: e.message };
    throw e;
  }
}

// Number result rounded to `decimals` places (0-8, default 2); the same
// rounding runs on both sides. Dates and empty results pass through.
export function roundResult(result, decimals = 2) {
  if (!result || result.kind !== "number") return result;
  const d = Number.isInteger(decimals) ? Math.min(Math.max(decimals, 0), 8) : 2;
  const factor = 10 ** d;
  return { ...result, value: Math.round((result.value + Number.EPSILON) * factor) / factor };
}
