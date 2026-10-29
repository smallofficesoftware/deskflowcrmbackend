// Saved filters for a form's entries list ("Form settings > Saved filters").
//
// Stored in the form's settings (settings_json, copied to published_settings_json on publish):
//   saved_filters: [ { id, name, is_default?, match: "all" | "any", groups: [ { match, rules: [ rule ] } ] } ]
// The entries list offers "All entries" plus each saved filter; the one marked is_default is applied when the
// list opens (at most one). The rules inside a group are joined by the group's `match`, and the groups by the
// filter's `match`, so
//   ((due + 5 days < today AND abc = xyz) OR (due + 5 days > today AND abc = pqr))
// is match "any" with two groups, each "all".
//
// A rule: { field, op, value?, value2?, values?, days?, value_label?, value_labels? }
//   `field` is a form field's key, or one of the entry's own fields:
//        _created (submitted on)   _status   _stage (approval)   _submitted_by
//   `value` the value to compare with, `value2` the upper end of "between", `values` the list for "is any of",
//   `days` the shift of a date field in "field + N days against today". `value_label(s)` are only the names shown
//   for ids (a status, a user ...) in the readable line; they never reach the SQL.
// What a rule can do depends on the field's kind - see OPS_BY_KIND below.
//
// The list applies the chosen filter on the server (before paging); a rule whose field was deleted from the
// form is skipped. Older settings kept ONE unnamed filter as `default_filters` (flat { match, rules } or
// { match, groups }); it is read as a saved filter named "Default filter", set as the default.

// ---- field kinds ----------------------------------------------------------------------------------------
const TYPE_KIND = {
  text: "text", textarea: "text", phone: "text", email: "text", url: "text", "auto-number": "text", barcode: "text",
  dropdown: "text", radio: "text", address: "text", location: "text",
  number: "number", currency: "number", percentage: "number", rating: "number", calculation: "number",
  date: "date", datetime: "date",
  time: "time",
  checkbox: "bool", switch: "bool", consent: "bool",
  "multi-select": "multi",
  reference: "id",
  "customer-lookup": "customer",
  user: "user",
};

// The entry's own fields (not form fields): their kind and the column they live in.
const SYSTEM_FIELDS = {
  _created: { kind: "date", column: "created_date_time", label: "Submitted on" },
  _status: { kind: "status", column: "submission_status_id", label: "Status" },
  _stage: { kind: "stage", column: null, label: "Approval" },
  _submitted_by: { kind: "user", column: "submitted_by_a_application_login_id", label: "Submitted by" },
};

const OPS_BY_KIND = {
  text: ["is", "is_not", "contains", "starts_with", "is_any_of", "is_empty", "is_not_empty"],
  number: ["is", "is_not", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  date: ["gt", "gte", "lt", "lte", "is", "preset", "between", "is_empty", "is_not_empty"],
  time: ["is", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  bool: ["is"],
  multi: ["contains", "is_any_of", "is_empty", "is_not_empty"],
  id: ["is", "is_not", "is_any_of", "is_empty", "is_not_empty"],
  customer: ["contains", "is_empty", "is_not_empty"],
  user: ["is", "is_not", "is_any_of", "is_empty", "is_not_empty"],
  status: ["is", "is_not", "is_any_of"],
  stage: ["is", "at_stage"],
};

const COMPARE_SQL = { is: "=", is_not: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
const OP_WORDS = {
  is: "is", is_not: "is not", contains: "contains", starts_with: "starts with", gt: ">", gte: ">=", lt: "<", lte: "<=",
  is_any_of: "is any of", between: "is between", is_empty: "is empty", is_not_empty: "is not empty", at_stage: "is at stage",
};

// Date presets: [first day, last day] as SQL on today. Fixed list - never built from user text.
const PRESET_SQL = {
  today: ["CURDATE()", "CURDATE()"],
  yesterday: ["DATE_SUB(CURDATE(), INTERVAL 1 DAY)", "DATE_SUB(CURDATE(), INTERVAL 1 DAY)"],
  tomorrow: ["DATE_ADD(CURDATE(), INTERVAL 1 DAY)", "DATE_ADD(CURDATE(), INTERVAL 1 DAY)"],
  last_7_days: ["DATE_SUB(CURDATE(), INTERVAL 6 DAY)", "CURDATE()"],
  last_30_days: ["DATE_SUB(CURDATE(), INTERVAL 29 DAY)", "CURDATE()"],
  next_7_days: ["CURDATE()", "DATE_ADD(CURDATE(), INTERVAL 6 DAY)"],
  this_week: ["DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)", "DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY)"],
  last_week: ["DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 7 DAY)", "DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 1 DAY)"],
  this_month: ["CAST(DATE_FORMAT(CURDATE(), '%Y-%m-01') AS DATE)", "LAST_DAY(CURDATE())"],
  last_month: ["CAST(DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AS DATE)", "LAST_DAY(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))"],
  this_year: ["CAST(DATE_FORMAT(CURDATE(), '%Y-01-01') AS DATE)", "CAST(DATE_FORMAT(CURDATE(), '%Y-12-31') AS DATE)"],
};
export const DATE_PRESETS = Object.keys(PRESET_SQL);
const PRESET_WORDS = {
  today: "today", yesterday: "yesterday", tomorrow: "tomorrow", last_7_days: "last 7 days", last_30_days: "last 30 days",
  next_7_days: "next 7 days", this_week: "this week", last_week: "last week", this_month: "this month",
  last_month: "last month", this_year: "this year",
};

// "Approval" values: where an entry is in its approval stages.
const STAGE_VALUES = { waiting_for_me: "waiting for me", pending: "pending", sent_back: "sent back", completed: "completed" };
const STAGE_COLUMN_STATUS = new Set(["pending", "sent_back", "completed"]);

export const SAVED_FILTER_MAX = 20;
export const SAVED_FILTER_NAME_MAX = 60;
export const DEFAULT_FILTER_MAX_RULES = 20; // conditions in ONE filter
export const DEFAULT_FILTER_MAX_GROUPS = 10; // groups in ONE filter
const MAX_DAYS = 3650;
const MAX_LIST = 50; // values in "is any of"
const MAX_TEXT = 255;
export const ME = "__me"; // "the logged-in user" in a user / submitted-by rule

const matchOf = (m) => (m === "any" ? "any" : "all");
const needsNoValue = (op) => op === "is_empty" || op === "is_not_empty";
const isBlank = (v) => v == null || String(v).trim() === "";
const isYmd = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isTime = (v) => /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(v));
const escapeLike = (s) => String(s).replace(/[\\%_]/g, "\\$&");
const toBool = (v) => (v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true" ? 1 : v === false || v === 0 || v === "0" || String(v).toLowerCase() === "false" ? 0 : null);

/** The kind of a form field (what a rule can do with it), or null when the type can't be filtered. */
export const defaultFilterKind = (field) => {
  if (!field) return null;
  if (field.type === "calculation" && field.result_type === "date") return "date"; // a calculated date is a DATE column
  return TYPE_KIND[field.type] || null;
};

// What a rule's `field` points at: { kind, column, label, system } or null (deleted field / unsupported type).
function infoFor(fieldKey, fields) {
  const sys = SYSTEM_FIELDS[fieldKey];
  if (sys) return { ...sys, system: true };
  const field = (fields || []).find((f) => f.key === fieldKey);
  const kind = defaultFilterKind(field);
  return kind ? { kind, column: field.key, label: field.label || field.key, system: false } : null;
}

// ---- reading the saved filters --------------------------------------------------------------------------
// { match, groups } from one filter's raw config (new groups form, or the older flat rules form), or null.
function normaliseConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  if (Array.isArray(cfg.groups)) {
    const groups = cfg.groups
      .filter((g) => g && typeof g === "object" && Array.isArray(g.rules) && g.rules.length > 0)
      .map((g) => ({ match: matchOf(g.match), rules: g.rules }));
    return groups.length ? { match: matchOf(cfg.match), groups } : null;
  }
  if (Array.isArray(cfg.rules) && cfg.rules.length > 0) {
    // Flat form: "all" = one group of every rule, "any" = each rule alone (joined by OR).
    const groups = cfg.match === "any" ? cfg.rules.map((r) => ({ match: "all", rules: [r] })) : [{ match: "all", rules: cfg.rules }];
    return { match: cfg.match === "any" ? "any" : "all", groups };
  }
  return null;
}

function parseSettingsObject(settings) {
  if (typeof settings !== "string") return settings && typeof settings === "object" ? settings : null;
  try {
    return JSON.parse(settings);
  } catch {
    return null;
  }
}

/**
 * The form's saved filters from settings_json text (or a parsed object):
 *   [ { id, name, is_default, match, groups } ]   - [] when there are none.
 * Entries without usable conditions are left out.
 */
export function parseSavedFilters(settings) {
  const parsed = parseSettingsObject(settings);
  if (!parsed) return [];
  if (Array.isArray(parsed.saved_filters)) {
    return parsed.saved_filters
      .map((f) => {
        const cfg = normaliseConfig(f);
        if (!cfg || !f || typeof f !== "object") return null;
        return { id: String(f.id ?? ""), name: String(f.name ?? "").trim(), is_default: f.is_default === true, ...cfg };
      })
      .filter(Boolean);
  }
  // Older single filter.
  const legacy = normaliseConfig(parsed.default_filters);
  return legacy ? [{ id: "default", name: "Default filter", is_default: true, ...legacy }] : [];
}

// ---- publish-time checks --------------------------------------------------------------------------------
const listOf = (rule) => (Array.isArray(rule.values) ? rule.values.filter((v) => !isBlank(v)) : []);

// A plain message for one rule, or null when it is usable.
function ruleProblem(rule, fields) {
  const info = infoFor(rule?.field, fields);
  if (!info) {
    const exists = (fields || []).some((f) => f.key === rule?.field);
    return exists ? "this field type can't be used in a filter." : "a condition points at a field that is no longer on the form. Fix or remove it.";
  }
  const name = `“${info.label}”`;
  if (!OPS_BY_KIND[info.kind].includes(rule.op)) return `${name}: pick a condition.`;
  const kind = info.kind;
  const op = rule.op;
  if (needsNoValue(op)) return null;

  if (kind === "date") {
    if (op === "preset") return PRESET_SQL[rule.value] ? null : `${name}: pick a period.`;
    if (op === "between") return isYmd(rule.value) && isYmd(rule.value2) ? (rule.value <= rule.value2 ? null : `${name}: the first date must not be after the second.`) : `${name}: pick both dates.`;
    const days = Number(rule.days ?? 0);
    return Number.isInteger(days) && Math.abs(days) <= MAX_DAYS ? null : `${name}: days must be a whole number (up to ${MAX_DAYS}).`;
  }
  if (kind === "time") {
    if (op === "between") return isTime(rule.value) && isTime(rule.value2) ? null : `${name}: enter both times as HH:MM.`;
    return isTime(rule.value) ? null : `${name}: enter the time as HH:MM.`;
  }
  if (kind === "number") {
    if (op === "between") return Number.isFinite(Number(rule.value)) && !isBlank(rule.value) && Number.isFinite(Number(rule.value2)) && !isBlank(rule.value2) ? null : `${name}: both values must be numbers.`;
    return !isBlank(rule.value) && Number.isFinite(Number(rule.value)) ? null : isBlank(rule.value) ? `${name}: enter the value to compare with.` : `${name}: the value must be a number.`;
  }
  if (kind === "bool") return toBool(rule.value) === null ? `${name}: choose yes or no.` : null;
  if (kind === "stage") {
    if (op === "is") return STAGE_VALUES[rule.value] ? null : `${name}: pick where the entry is.`;
    return isBlank(rule.value) || String(rule.value).length > 50 ? `${name}: pick a stage.` : null;
  }

  // Everything else compares with a value or a list of values.
  if (op === "is_any_of") {
    const list = listOf(rule);
    if (list.length === 0) return `${name}: pick at least one value.`;
    if (list.length > MAX_LIST) return `${name}: at most ${MAX_LIST} values.`;
    return kind === "text" || kind === "multi" ? null : list.every((v) => (v === ME && kind === "user") || Number.isInteger(Number(v))) ? null : `${name}: the values could not be read.`;
  }
  if (isBlank(rule.value)) return `${name}: enter the value to compare with.`;
  if (String(rule.value).length > MAX_TEXT) return `${name}: the value is too long.`;
  if ((kind === "id" || kind === "user" || kind === "status") && !(kind === "user" && rule.value === ME) && !Number.isInteger(Number(rule.value))) return `${name}: the value could not be read.`;
  return null;
}

function findConfigProblems(filter, fields) {
  if (filter.groups.length > DEFAULT_FILTER_MAX_GROUPS) return `at most ${DEFAULT_FILTER_MAX_GROUPS} groups.`;
  const total = filter.groups.reduce((n, g) => n + g.rules.length, 0);
  if (total > DEFAULT_FILTER_MAX_RULES) return `at most ${DEFAULT_FILTER_MAX_RULES} conditions.`;
  for (const group of filter.groups) {
    for (const rule of group.rules) {
      const problem = ruleProblem(rule, fields);
      if (problem) return problem;
    }
  }
  return null;
}

/** Publish-time check of every saved filter: a plain message, or null when all are usable. */
export function findSavedFilterProblems(settingsJson, fields) {
  const parsed = parseSettingsObject(settingsJson);
  if (!parsed) return null;
  const rawCount = Array.isArray(parsed.saved_filters) ? parsed.saved_filters.length : 0;
  if (rawCount > SAVED_FILTER_MAX) return `Saved filters: at most ${SAVED_FILTER_MAX} filters.`;
  const filters = parseSavedFilters(parsed);
  if (rawCount > filters.length) return "A saved filter has no conditions. Add a condition or remove the filter (Form settings > Saved filters).";
  const ids = new Set();
  let defaults = 0;
  for (const f of filters) {
    const label = `Saved filter “${f.name || "(no name)"}”`;
    if (!f.name) return "Every saved filter needs a name (Form settings > Saved filters).";
    if (f.name.length > SAVED_FILTER_NAME_MAX) return `${label}: the name can be up to ${SAVED_FILTER_NAME_MAX} characters.`;
    if (!f.id || ids.has(f.id)) return `${label}: could not be read. Remove it and add it again.`;
    ids.add(f.id);
    if (f.is_default) defaults += 1;
    const problem = findConfigProblems(f, fields);
    if (problem) return `${label}: ${problem}`;
  }
  if (defaults > 1) return "Only one saved filter can be the default.";
  return null;
}

// ---- building the SQL -----------------------------------------------------------------------------------
// SQL for one rule, or null when it can't be used (deleted field, bad op / value). Values go in `replacements`.
// `ctx` = { loginId, pendingForMe: () => { sql, replacements } | null } for "me" and "waiting for me".
function ruleSql(rule, fields, quote, param, replacements, ctx) {
  const info = infoFor(rule?.field, fields);
  if (!info || ruleProblem(rule, fields)) return null;
  const kind = info.kind;
  const op = rule.op;
  const col = info.column ? quote(info.column) : null;

  // The approval stage is not a column of its own.
  if (kind === "stage") {
    if (op === "at_stage") {
      replacements[param] = String(rule.value);
      return `${quote("current_stage")} = :${param}`;
    }
    if (rule.value === "waiting_for_me") {
      const pending = ctx?.pendingForMe ? ctx.pendingForMe() : null;
      if (!pending) return "1 = 0";
      Object.assign(replacements, pending.replacements);
      return pending.sql;
    }
    return STAGE_COLUMN_STATUS.has(rule.value) ? `${quote("stage_status")} = '${rule.value}'` : null;
  }

  if (op === "is_empty" || op === "is_not_empty") {
    const empty = op === "is_empty";
    if (kind === "text") return empty ? `(${col} IS NULL OR ${col} = '')` : `(${col} IS NOT NULL AND ${col} <> '')`;
    if (kind === "multi") return empty ? `(${col} IS NULL OR ${col} = '' OR ${col} = '[]')` : `(${col} IS NOT NULL AND ${col} <> '' AND ${col} <> '[]')`;
    return empty ? `${col} IS NULL` : `${col} IS NOT NULL`;
  }

  if (kind === "date") {
    if (op === "preset") {
      const [from, to] = PRESET_SQL[rule.value];
      return `(${col} IS NOT NULL AND DATE(${col}) BETWEEN ${from} AND ${to})`;
    }
    if (op === "between") {
      replacements[`${param}a`] = String(rule.value);
      replacements[`${param}b`] = String(rule.value2);
      return `(${col} IS NOT NULL AND DATE(${col}) BETWEEN :${param}a AND :${param}b)`;
    }
    replacements[param] = Number(rule.days ?? 0);
    // The day the field falls on, moved by `days`, against today (a datetime's time of day is ignored).
    return `(${col} IS NOT NULL AND DATE(DATE_ADD(${col}, INTERVAL :${param} DAY)) ${COMPARE_SQL[op]} CURDATE())`;
  }

  if (kind === "time") {
    if (op === "between") {
      replacements[`${param}a`] = String(rule.value);
      replacements[`${param}b`] = String(rule.value2);
      return `(${col} IS NOT NULL AND ${col} BETWEEN :${param}a AND :${param}b)`;
    }
    replacements[param] = String(rule.value);
    return `(${col} IS NOT NULL AND ${col} ${COMPARE_SQL[op]} :${param})`;
  }

  if (kind === "number") {
    if (op === "between") {
      replacements[`${param}a`] = Number(rule.value);
      replacements[`${param}b`] = Number(rule.value2);
      return `(${col} IS NOT NULL AND ${col} BETWEEN :${param}a AND :${param}b)`;
    }
    replacements[param] = Number(rule.value);
    return `(${col} IS NOT NULL AND ${col} ${COMPARE_SQL[op]} :${param})`;
  }

  if (kind === "bool") {
    return toBool(rule.value) === 1 ? `${col} = 1` : `(${col} = 0 OR ${col} IS NULL)`;
  }

  if (kind === "multi") {
    // Stored as JSON text, e.g. ["a","b"]: an option is there when its quoted form is.
    const values = op === "is_any_of" ? listOf(rule) : [rule.value];
    const likes = values.map((v, i) => {
      replacements[`${param}_${i}`] = `%${escapeLike(JSON.stringify(String(v)))}%`;
      return `${col} LIKE :${param}_${i}`;
    });
    return `(${likes.join(" OR ")})`;
  }

  if (kind === "customer") {
    // Stores a contact id - match on the contact's name / company / mobile, like the grid's column filter.
    replacements[param] = `%${String(rule.value).trim()}%`;
    return `${col} IN (SELECT id FROM \`contact_masters\` WHERE isDelete = 0 AND (person_name LIKE :${param} OR company_name LIKE :${param} OR mobile_number LIKE :${param} OR raw_mobile_number LIKE :${param}))`;
  }

  if (kind === "id" || kind === "user" || kind === "status") {
    const me = (v) => (kind === "user" && v === ME ? ctx?.loginId : v);
    const ids = (op === "is_any_of" ? listOf(rule) : [rule.value]).map(me).map(Number).filter((n) => Number.isInteger(n));
    if (ids.length === 0) return "1 = 0"; // "me" with no known user: nothing can match
    if (op === "is_any_of") {
      replacements[param] = ids;
      return `${col} IN (:${param})`;
    }
    replacements[param] = ids[0];
    return op === "is_not" ? `(${col} IS NULL OR ${col} <> :${param})` : `${col} = :${param}`;
  }

  // text
  if (op === "is_any_of") {
    replacements[param] = listOf(rule).map((v) => String(v).trim());
    return `${col} IN (:${param})`;
  }
  const value = String(rule.value).trim();
  if (op === "contains" || op === "starts_with") {
    replacements[param] = op === "contains" ? `%${escapeLike(value)}%` : `${escapeLike(value)}%`;
    return `(${col} LIKE :${param} AND ${col} NOT LIKE 'fbenc:%')`;
  }
  replacements[param] = value;
  // is_not keeps rows with no value too ("not Open" includes blanks).
  return op === "is_not" ? `(${col} IS NULL OR ${col} <> :${param})` : `${col} = :${param}`;
}

/**
 * SQL for ONE saved filter ({ match, groups }), to AND into the list's WHERE: { sql, replacements } or null
 * when no rule is usable. `quote` quotes a column name the way the list does (q()). Values always go in as
 * replacements. `ctx` = { loginId, pendingForMe } (see ruleSql).
 */
export function buildDefaultFilterClause(config, fields, { quote, prefix = "dfv", ctx } = {}) {
  if (!config || !Array.isArray(config.groups) || typeof quote !== "function") return null;
  const replacements = {};
  const groupParts = [];
  let n = 0;
  let used = 0;
  for (const group of config.groups.slice(0, DEFAULT_FILTER_MAX_GROUPS)) {
    const parts = [];
    for (const rule of (group.rules || []).slice(0, Math.max(0, DEFAULT_FILTER_MAX_RULES - used))) {
      const sql = ruleSql(rule, fields, quote, `${prefix}_${n}`, replacements, ctx);
      if (sql) {
        parts.push(sql);
        n += 1;
      }
      used += 1;
    }
    if (parts.length) groupParts.push(`(${parts.join(group.match === "any" ? " OR " : " AND ")})`);
  }
  if (groupParts.length === 0) return null;
  return { sql: `(${groupParts.join(config.match === "any" ? " OR " : " AND ")})`, replacements };
}

// ---- the readable line ----------------------------------------------------------------------------------
const nameOf = (v, label) => (isBlank(label) ? String(v) : String(label));

const describeRule = (rule, fields) => {
  const info = infoFor(rule?.field, fields);
  if (!info || ruleProblem(rule, fields)) return null;
  const { kind, op, label } = { ...info, op: rule.op };
  if (needsNoValue(op)) return `${label} ${OP_WORDS[op]}`;

  if (kind === "stage") return op === "at_stage" ? `${label} ${OP_WORDS[op]} ${nameOf(rule.value, rule.value_label)}` : `${label} is ${STAGE_VALUES[rule.value]}`;
  if (kind === "date") {
    if (op === "preset") return `${label}: ${PRESET_WORDS[rule.value]}`;
    if (op === "between") return `${label} ${OP_WORDS.between} ${rule.value} and ${rule.value2}`;
    const days = Number(rule.days ?? 0) || 0;
    const shift = days === 0 ? "" : days > 0 ? ` + ${days} day${days === 1 ? "" : "s"}` : ` - ${Math.abs(days)} day${days === -1 ? "" : "s"}`;
    return `${label}${shift} ${OP_WORDS[op]} today`;
  }
  if (op === "between") return `${label} ${OP_WORDS.between} ${rule.value} and ${rule.value2}`;
  if (kind === "bool") return `${label} is ${toBool(rule.value) === 1 ? "yes" : "no"}`;
  if (op === "is_any_of") {
    const labels = Array.isArray(rule.value_labels) && rule.value_labels.length === listOf(rule).length ? rule.value_labels : listOf(rule);
    return `${label} ${OP_WORDS[op]} ${labels.map((v) => (v === ME ? "me" : v)).join(", ")}`;
  }
  const shown = rule.value === ME ? "me" : nameOf(rule.value, rule.value_label);
  return `${label} ${OP_WORDS[op]} ${shown}`;
};

/** One readable line for a saved filter, e.g. `(Due + 5 days < today AND Abc is xyz) OR (...)`. */
export function describeDefaultFilters(config, fields) {
  if (!config || !Array.isArray(config.groups)) return "";
  const groups = config.groups
    .map((g) => (g.rules || []).map((r) => describeRule(r, fields)).filter(Boolean).join(g.match === "any" ? " OR " : " AND "))
    .filter(Boolean);
  if (groups.length === 0) return "";
  if (groups.length === 1) return groups[0];
  return groups.map((g) => `(${g})`).join(config.match === "any" ? " OR " : " AND ");
}

/**
 * The filter a list request uses. `choice` is the request's filter_id: "__default" = the form's default filter
 * (none -> all entries), "" / missing = all entries, anything else = that saved filter's id (unknown -> all).
 */
export function pickSavedFilter(filters, choice) {
  if (choice === "__default") return filters.find((f) => f.is_default) || null;
  if (choice == null || choice === "") return null;
  return filters.find((f) => f.id === String(choice)) || null;
}
