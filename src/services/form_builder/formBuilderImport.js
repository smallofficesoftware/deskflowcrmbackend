// Excel import of old paper records (plan item Q3/Q4). Pure module, no
// imports. The browser reads the sheet; each cell arrives here as plain
// text/number and is turned into the same kind of answer a person would have
// typed on the fill screen. The server's normal submit validation then
// judges it, so an imported row can never bypass a rule.
//
// Importable: single-value fields that can be typed in a cell. Not importable
// (skipped in the sample sheet): tables, question tables, files/photos/
// signatures, GPS, lookups of CRM records and calculated fields.

export const IMPORT_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "currency",
  "percentage",
  "phone",
  "email",
  "url",
  "address",
  "barcode",
  "dropdown",
  "radio",
  "multi-select",
  "checkbox",
  "switch",
  "rating",
  "consent",
  "date",
  "datetime",
  "time",
  "auto-number",
]);

export const IMPORT_ROW_CAP = 500; // rows per request; the screen sends bigger sheets in chunks

const YES = new Set(["yes", "y", "true", "1", "tick", "ticked", "checked", "x"]);
const NO = new Set(["no", "n", "false", "0", "", "unticked", "unchecked"]);

function isBlank(raw) {
  return raw == null || (typeof raw === "string" && raw.trim() === "");
}

export function importableFields(fields) {
  return (Array.isArray(fields) ? fields : []).filter((f) => f && f.key && IMPORT_TYPES.has(f.type));
}

function hintFor(f) {
  switch (f.type) {
    case "dropdown":
    case "radio":
      return f.options?.length ? `One of: ${f.options.join(", ")}` : "Text";
    case "multi-select":
      return f.options?.length ? `Any of: ${f.options.join(", ")} (separate with commas)` : "Separate with commas";
    case "checkbox":
    case "switch":
    case "consent":
      return "Yes or No";
    case "date":
      return "Date, like 25-12-2026";
    case "datetime":
      return "Date and time, like 25-12-2026 14:30";
    case "time":
      return "Time, like 14:30";
    case "number":
    case "rating":
      return "Number";
    case "currency":
      return "Amount";
    case "percentage":
      return "0 to 100";
    case "auto-number":
      return "The old number to keep (leave empty to give a new one)";
    case "phone":
      return "Phone number";
    case "email":
      return "Email address";
    default:
      return "Text";
  }
}

// One column of the sheet per importable field. A repeated label gets its
// key added so two columns never share a heading.
export function importColumns(fields, { canOverrideAutoNumber = false } = {}) {
  const usable = importableFields(fields).filter((f) => f.type !== "auto-number" || canOverrideAutoNumber);
  const counts = new Map();
  usable.forEach((f) => {
    const id = (f.label || f.key).trim().toLowerCase();
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  return usable.map((f) => {
    const label = (f.label || f.key).trim();
    return {
      key: f.key,
      header: counts.get(label.toLowerCase()) > 1 ? `${label} (${f.key})` : label,
      label,
      type: f.type,
      required: !!f.required,
      options: Array.isArray(f.options) ? f.options : [],
      hint: hintFor(f),
    };
  });
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Excel stores dates as days since 1899-12-30.
function fromExcelSerial(serial) {
  const ms = Math.round(serial * 86400000);
  const dt = new Date(Date.UTC(1899, 11, 30) + ms);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
    minutes: dt.getUTCHours() * 60 + dt.getUTCMinutes(),
  };
}

// -> { y, m, d, minutes|null } or null
export function parseDateCell(raw) {
  if (typeof raw === "number") {
    if (raw < 1 || raw > 80000) return null;
    const p = fromExcelSerial(raw);
    return { ...p, minutes: raw % 1 ? p.minutes : null };
  }
  const text = String(raw).trim();
  let y;
  let mo;
  let d;
  let hh = null;
  let mm = null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(text);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(text);
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (m[4] != null) {
    hh = Number(m[4]);
    mm = Number(m[5]);
  }
  if (!validDate(y, mo, d)) return null;
  if (hh != null && (hh > 23 || mm > 59)) return null;
  return { y, m: mo, d, minutes: hh != null ? hh * 60 + mm : null };
}

function parseTimeCell(raw) {
  if (typeof raw === "number") {
    if (raw < 0 || raw >= 1) return null;
    const total = Math.round(raw * 1440);
    return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
  }
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(String(raw).trim());
  if (!m) return null;
  let h = Number(m[1]);
  if (m[4]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[4].toLowerCase() === "pm" ? 12 : 0);
  }
  if (h > 23 || Number(m[2]) > 59) return null;
  return `${pad(h)}:${m[2]}`;
}

function matchOption(options, text) {
  const wanted = String(text).trim().toLowerCase();
  return options.find((o) => String(o).trim().toLowerCase() === wanted);
}

// One cell -> the answer the fill screen would have sent.
//   { value }  (undefined when the cell is empty — the field stays unanswered)
//   { error }  plain message naming the field
export function coerceImportCell(field, raw) {
  const name = field.label || field.key;
  if (isBlank(raw)) return { value: undefined };

  switch (field.type) {
    case "number":
    case "rating":
    case "currency":
    case "percentage": {
      if (typeof raw === "number") return { value: raw };
      const cleaned = String(raw).replace(/[,\s₹%]/g, "");
      if (cleaned === "" || Number.isNaN(Number(cleaned))) return { error: `${name}: "${String(raw).trim()}" is not a number` };
      return { value: Number(cleaned) };
    }
    case "checkbox":
    case "switch":
    case "consent": {
      const t = String(raw).trim().toLowerCase();
      if (YES.has(t)) return { value: true };
      if (NO.has(t)) return { value: false };
      return { error: `${name}: write Yes or No (found "${String(raw).trim()}")` };
    }
    case "dropdown":
    case "radio": {
      const options = Array.isArray(field.options) ? field.options : [];
      if (!options.length) return { value: String(raw).trim() };
      const hit = matchOption(options, raw);
      if (hit === undefined) return { error: `${name}: "${String(raw).trim()}" is not one of ${options.join(", ")}` };
      return { value: hit };
    }
    case "multi-select": {
      const options = Array.isArray(field.options) ? field.options : [];
      const parts = String(raw)
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const out = [];
      for (const p of parts) {
        if (!options.length) {
          out.push(p);
          continue;
        }
        const hit = matchOption(options, p);
        if (hit === undefined) return { error: `${name}: "${p}" is not one of ${options.join(", ")}` };
        if (!out.includes(hit)) out.push(hit);
      }
      return { value: out };
    }
    case "date": {
      const p = parseDateCell(raw);
      if (!p) return { error: `${name}: "${String(raw).trim()}" is not a date (use day-month-year like 25-12-2026)` };
      return { value: `${p.y}-${pad(p.m)}-${pad(p.d)}` };
    }
    case "datetime": {
      const p = parseDateCell(raw);
      if (!p) return { error: `${name}: "${String(raw).trim()}" is not a date and time (like 25-12-2026 14:30)` };
      const minutes = p.minutes ?? 0;
      // +05:30, the zone the whole CRM works in.
      return { value: `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00+05:30` };
    }
    case "time": {
      const t = parseTimeCell(raw);
      if (!t) return { error: `${name}: "${String(raw).trim()}" is not a time (like 14:30)` };
      return { value: t };
    }
    default:
      return { value: typeof raw === "number" ? String(raw) : String(raw).trim() };
  }
}

// One sheet row ({ columnKey: cellValue }) -> answers + cell problems. Only
// keys of importable columns are read; anything else in the row is ignored.
export function rowToAnswers(columns, cells) {
  const answers = {};
  const errors = [];
  for (const col of columns) {
    const result = coerceImportCell(col, cells?.[col.key]);
    if (result.error) errors.push(result.error);
    else if (result.value !== undefined) answers[col.key] = result.value;
  }
  return { answers, errors };
}
