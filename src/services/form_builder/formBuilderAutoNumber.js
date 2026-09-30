// Auto-number fields (plan item B): configurable format, reset rule,
// optional separate series chosen by another field's value, and a
// concurrency-safe counter in form_builder_number_series.
//
// Field prop shape (field.type === "auto-number"):
//   auto_number: {
//     prefix: "ENV",                 // used by {PREFIX}
//     format: "{PREFIX}/{FY}/{SEQ}", // must contain {SEQ}
//     start: 1,                      // first number of every period/series
//     padding: 4,                    // {SEQ} zero-padded to this width
//     reset: "never" | "fy" | "year" | "month",
//     series_by: "division" | null,  // key of another field (optional)
//     series_prefixes: { "Food": "FD", "Water": "WT" }, // value -> prefix
//     date_field: "entry_date" | null // date field the period is taken from (default: today)
//   }
//
// Financial year text reuses getFinancialYear from sharedFunctions.js
// unchanged ({FY} = "2026-2027", {FYS} = "26-27").

import moment from "moment";
import { QueryTypes } from "sequelize";
import { getFinancialYear } from "../../utils/sharedFunctions.js";

export const AUTO_NUMBER_RESETS = ["never", "fy", "year", "month"];
export const AUTO_NUMBER_TOKENS = ["{PREFIX}", "{FY}", "{FYS}", "{YYYY}", "{YY}", "{MM}", "{SEQ}"];

const NUMBER_SERIES_TABLE = "form_builder_number_series";
const COLUMN_MAX_LENGTH = 100; // auto-number column is VARCHAR(100)
const SERIES_KEY_MAX_LENGTH = 100;
const MAX_PADDING = 10;

// Which tokens make each reset rule produce distinct numbers per period —
// without one, a yearly reset would hand out ENV/0001 again next year.
const PERIOD_TOKENS_BY_RESET = {
  never: [],
  fy: [["{FY}"], ["{FYS}"]],
  year: [["{YYYY}"], ["{YY}"], ["{FY}"], ["{FYS}"]],
  month: [["{YYYY}", "{MM}"], ["{YY}", "{MM}"]],
};

export function normalizeAutoNumberConfig(config) {
  const c = config && typeof config === "object" ? config : {};
  const start = Number.isInteger(Number(c.start)) && Number(c.start) >= 1 ? Number(c.start) : 1;
  const padding = Number.isInteger(Number(c.padding)) && Number(c.padding) >= 1 ? Math.min(Number(c.padding), MAX_PADDING) : 4;
  return {
    prefix: c.prefix != null ? String(c.prefix).trim() : "",
    format: c.format && String(c.format).trim() ? String(c.format).trim() : "{PREFIX}{SEQ}",
    start,
    padding,
    reset: AUTO_NUMBER_RESETS.includes(c.reset) ? c.reset : "never",
    series_by: c.series_by ? String(c.series_by) : null,
    series_prefixes: c.series_prefixes && typeof c.series_prefixes === "object" ? c.series_prefixes : {},
    date_field: c.date_field ? String(c.date_field) : null,
  };
}

function fieldName(field) {
  return `“${field.label || field.key}”`;
}

// Publish-time check. Returns a plain-language message or null.
// `fields` is the whole top-level field list (for series_by / date_field).
export function validateAutoNumberConfig(field, fields = []) {
  const raw = field.auto_number && typeof field.auto_number === "object" ? field.auto_number : {};
  const c = normalizeAutoNumberConfig(raw);
  const name = fieldName(field);

  if (raw.reset != null && !AUTO_NUMBER_RESETS.includes(raw.reset)) {
    return `${name}: choose when the number should start again (never, every financial year, every year or every month).`;
  }
  if (!c.format.includes("{SEQ}")) {
    return `${name}: the number format must include {SEQ} — that's where the running number goes.`;
  }
  const unknown = (c.format.match(/\{[^}]*\}/g) || []).filter((t) => !AUTO_NUMBER_TOKENS.includes(t));
  if (unknown.length > 0) {
    return `${name}: ${unknown.join(", ")} isn't a known part of the number format. Use ${AUTO_NUMBER_TOKENS.join(" ")}.`;
  }
  const periodOptions = PERIOD_TOKENS_BY_RESET[c.reset];
  if (periodOptions.length > 0 && !periodOptions.some((set) => set.every((t) => c.format.includes(t)))) {
    const needs = { fy: "{FY} or {FYS}", year: "{YYYY} or {YY}", month: "{MM} together with {YYYY} or {YY}" }[c.reset];
    return `${name}: the number starts again every ${c.reset === "fy" ? "financial year" : c.reset}, so the format must include ${needs} — otherwise the same number would repeat.`;
  }

  if (c.series_by) {
    const seriesField = fields.find((f) => f.key === c.series_by);
    if (!seriesField) return `${name}: the field it takes a separate series from no longer exists. Pick another field or turn separate series off.`;
    if (!c.format.includes("{PREFIX}")) {
      return `${name}: with a separate series per “${seriesField.label || seriesField.key}”, the format must include {PREFIX} so the series can be told apart.`;
    }
    const prefixes = Object.values(c.series_prefixes).map((p) => String(p).trim().toUpperCase()).filter(Boolean);
    if (new Set(prefixes).size !== prefixes.length) {
      return `${name}: two series use the same prefix. Give each one its own prefix.`;
    }
  }

  if (c.date_field) {
    const dateField = fields.find((f) => f.key === c.date_field);
    if (!dateField || !["date", "datetime"].includes(dateField.type)) {
      return `${name}: the date it takes the year/month from must be a date field on this form.`;
    }
  }

  // Longest possible output must fit the column.
  const longest = formatAutoNumber(c, {
    seq: 10 ** Math.max(c.padding, 9) - 1,
    date: new Date(),
    seriesKey: "",
    prefixOverride: longestPrefix(c),
  });
  if (longest.length > COLUMN_MAX_LENGTH) {
    return `${name}: the number format is too long (numbers can be at most ${COLUMN_MAX_LENGTH} characters). Shorten the prefix or format.`;
  }
  return null;
}

function longestPrefix(c) {
  const all = [c.prefix, ...Object.values(c.series_prefixes).map(String)];
  return all.reduce((a, b) => (String(b).length > String(a).length ? String(b) : String(a)), "");
}

// Date parts in the app's +05:30 zone (same as default_today).
function dateParts(date) {
  const m = moment(date || new Date()).utcOffset("+05:30");
  const ymd = m.format("YYYY-MM-DD");
  return {
    ymd,
    yyyy: m.format("YYYY"),
    yy: m.format("YY"),
    mm: m.format("MM"),
    fy: getFinancialYear(ymd),
    fys: getFinancialYear(ymd, true),
  };
}

export function periodKeyFor(reset, date) {
  const p = dateParts(date);
  switch (reset) {
    case "fy":
      return p.fy;
    case "year":
      return p.yyyy;
    case "month":
      return `${p.yyyy}-${p.mm}`;
    default:
      return "all";
  }
}

// Series is the chosen value of the series_by field ("" = single series).
export function seriesKeyFor(config, answers) {
  const c = normalizeAutoNumberConfig(config);
  if (!c.series_by) return "";
  const value = answers?.[c.series_by];
  if (value == null || value === "") return "";
  return String(Array.isArray(value) ? value[0] : value).trim().slice(0, SERIES_KEY_MAX_LENGTH);
}

// Prefix for a series: the mapped prefix, else the series value itself
// (uppercased, spaces removed) so two unmapped series never collide, else
// the field's own prefix.
export function prefixForSeries(config, seriesKey) {
  const c = normalizeAutoNumberConfig(config);
  if (!seriesKey) return c.prefix;
  const mapped = c.series_prefixes[seriesKey];
  if (mapped != null && String(mapped).trim()) return String(mapped).trim();
  return String(seriesKey).replace(/\s+/g, "").toUpperCase();
}

export function formatAutoNumber(config, { seq, date, seriesKey = "", prefixOverride = null }) {
  const c = normalizeAutoNumberConfig(config);
  const p = dateParts(date);
  const prefix = prefixOverride != null ? prefixOverride : prefixForSeries(c, seriesKey);
  const values = {
    "{PREFIX}": prefix,
    "{FY}": p.fy,
    "{FYS}": p.fys,
    "{YYYY}": p.yyyy,
    "{YY}": p.yy,
    "{MM}": p.mm,
    "{SEQ}": String(seq).padStart(c.padding, "0"),
  };
  return c.format.replace(/\{[A-Z]+\}/g, (token) => (token in values ? values[token] : token));
}

// Live example for the editor ("Next number will look like ...").
export function previewAutoNumber(config, { date = new Date(), seriesKey = "" } = {}) {
  const c = normalizeAutoNumberConfig(config);
  return formatAutoNumber(c, { seq: c.start, date, seriesKey });
}

// The date the period comes from: the configured date field's value when
// it has one, else now.
export function numberingDateFor(config, answers) {
  const c = normalizeAutoNumberConfig(config);
  if (c.date_field) {
    const value = answers?.[c.date_field];
    const d = value ? new Date(value) : null;
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function isDuplicateError(e) {
  return e?.original?.code === "ER_DUP_ENTRY" || e?.parent?.code === "ER_DUP_ENTRY";
}

// Takes the next number for one auto-number field. MUST run inside the
// same transaction as the submission insert, so a failed save doesn't
// burn a number and two parallel saves can't get the same one (the
// counter row is locked with FOR UPDATE until the transaction ends).
export async function assignAutoNumber({ tenantDB, transaction, company_masters_id, form_id, field, answers }) {
  if (!transaction) throw new Error("assignAutoNumber must run inside a transaction");
  const c = normalizeAutoNumberConfig(field.auto_number);
  const date = numberingDateFor(c, answers);
  const seriesKey = seriesKeyFor(c, answers);
  const periodKey = periodKeyFor(c.reset, date);
  const where = { form_id, field_key: field.key, series_key: seriesKey, period_key: periodKey };

  for (let attempt = 0; attempt < 2; attempt++) {
    const rows = await tenantDB.query(
      `SELECT id, last_number FROM \`${NUMBER_SERIES_TABLE}\`
       WHERE form_id = :form_id AND field_key = :field_key AND series_key = :series_key AND period_key = :period_key
       FOR UPDATE`,
      { replacements: where, type: QueryTypes.SELECT, transaction },
    );

    if (rows.length > 0) {
      const seq = Math.max(Number(rows[0].last_number) + 1, c.start);
      await tenantDB.query(
        `UPDATE \`${NUMBER_SERIES_TABLE}\` SET last_number = :seq, updated_date_time = NOW() WHERE id = :id`,
        { replacements: { seq, id: rows[0].id }, type: QueryTypes.UPDATE, transaction },
      );
      return formatAutoNumber(c, { seq, date, seriesKey });
    }

    try {
      await tenantDB.query(
        `INSERT INTO \`${NUMBER_SERIES_TABLE}\`
         (company_masters_id, form_id, field_key, series_key, period_key, last_number, created_date_time)
         VALUES (:company_masters_id, :form_id, :field_key, :series_key, :period_key, :seq, NOW())`,
        { replacements: { ...where, company_masters_id, seq: c.start }, type: QueryTypes.INSERT, transaction },
      );
      return formatAutoNumber(c, { seq: c.start, date, seriesKey });
    } catch (e) {
      // Another save created the first row of this period at the same
      // moment — loop once more and take the next number from it.
      if (!isDuplicateError(e) || attempt > 0) throw e;
    }
  }
  throw new Error("assignAutoNumber: could not take a number");
}

// Manual number typed by a user with the override permission (B6).
// Returns { value } or { error }.
export function validateManualAutoNumber(field, value) {
  const str = value == null ? "" : String(value).trim();
  if (!str) return { error: `${fieldName(field)}: enter a number or leave it to be filled automatically` };
  if (str.length > COLUMN_MAX_LENGTH) return { error: `${fieldName(field)} can be at most ${COLUMN_MAX_LENGTH} characters` };
  return { value: str };
}
