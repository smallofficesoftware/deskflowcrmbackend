// Date edit rules — Form Builder v2 items C2, C3, C5. Pure module (moment
// only), used by buildValidatedAnswers on create AND update, internal AND
// public. Server-side is the authority: the UI only locks the field.
//
// Field prop on a date / datetime field (inside schema_json):
//   edit_rule: {
//     mode: "always" | "never" | "permission",  // default "always"
//     past_days: number | null,   // max days in the past (null = no limit)
//     allow_future: boolean       // default true
//   }
//   always     -> anyone may pick the date (limits apply to everyone)
//   never      -> always today (date) / now (datetime), set by the server
//   permission -> only users with this form's "change_dates" permission may
//                 pick it; for everyone else (and every public submitter) it
//                 behaves like "never"
// When the server sets the date: on a new entry it writes today / now; on an
// edit it keeps the stored value (or writes today / now if nothing is
// stored yet, e.g. a field added after the entry was saved).
import moment from "moment";

export const DATE_EDIT_MODES = ["always", "never", "permission"];
const DATE_TYPES = new Set(["date", "datetime"]);
// Same zone the tenant Sequelize connections use (dbManager.js) and
// default_today already uses.
const TZ = "+05:30";

export function isDateField(field) {
  return !!field && DATE_TYPES.has(field.type);
}

export function dateEditMode(field) {
  const mode = field?.edit_rule?.mode;
  return DATE_EDIT_MODES.includes(mode) ? mode : "always";
}

// May this submitter pick the date themselves?
export function canEditDate(field, { canChangeDates = false, isPublic = false } = {}) {
  const mode = dateEditMode(field);
  if (mode === "never") return false;
  if (mode === "permission") return !isPublic && !!canChangeDates;
  return true;
}

// Today (date) / now (datetime) as the server writes it.
export function serverDateValue(field, now = new Date()) {
  if (field.type === "date") return moment(now).utcOffset(TZ).format("YYYY-MM-DD");
  return now;
}

function dayOf(value) {
  if (value == null || value === "") return null;
  // A plain YYYY-MM-DD is a calendar day, not a UTC instant.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return moment(value.trim(), "YYYY-MM-DD").format("YYYY-MM-DD");
  }
  const m = moment(value instanceof Date ? value : new Date(value));
  if (!m.isValid()) return null;
  return m.utcOffset(TZ).format("YYYY-MM-DD");
}

// Same calendar day (date) / same instant to the second (datetime) —
// unchanged dates on an edit are never re-checked against the limits, so an
// old entry can still be edited after it has aged past past_days.
export function sameStoredDate(field, value, storedValue) {
  if (value == null || value === "" || storedValue == null) return false;
  if (field.type === "date") return dayOf(value) != null && dayOf(value) === dayOf(storedValue);
  const a = new Date(value).getTime();
  const b = new Date(storedValue).getTime();
  return !Number.isNaN(a) && !Number.isNaN(b) && Math.floor(a / 1000) === Math.floor(b / 1000);
}

// past_days / allow_future check for a date the submitter picked. Returns a
// plain message or null. Compared by calendar day in +05:30.
export function checkDateLimits(field, value, now = new Date()) {
  const rule = field?.edit_rule || {};
  const day = dayOf(value);
  if (!day) return null; // not a date — the normal validator reports it
  const today = moment(now).utcOffset(TZ).format("YYYY-MM-DD");
  const label = field.label || field.key;

  if (rule.allow_future === false && day > today) {
    return `${label} can't be a future date`;
  }
  const pastDays = rule.past_days;
  if (pastDays != null && pastDays !== "" && Number.isFinite(Number(pastDays)) && Number(pastDays) >= 0) {
    const diff = moment(today, "YYYY-MM-DD").diff(moment(day, "YYYY-MM-DD"), "days");
    if (diff > Number(pastDays)) {
      const n = Number(pastDays);
      if (n === 0) return `${label} can't be a past date`;
      return `${label} can't be more than ${n} day${n === 1 ? "" : "s"} in the past`;
    }
  }
  return null;
}

// Decides what happens to one date field's submitted value.
//   { action: "server", value }  -> write this server-set value
//   { action: "keep" }           -> edit: leave the stored column untouched
//   { action: "client" }         -> validate the submitted value normally,
//                                   then run checkDateLimits (unless it is
//                                   unchanged from the stored value)
export function resolveDateValue(field, { isUpdate = false, storedValue = null, canChangeDates = false, isPublic = false, now = new Date() } = {}) {
  if (canEditDate(field, { canChangeDates, isPublic })) return { action: "client" };
  if (isUpdate && storedValue != null) return { action: "keep" };
  return { action: "server", value: serverDateValue(field, now) };
}

// Builder-side sanity check for publish: plain message or null.
export function findDateRuleProblems(fields) {
  const check = (list, parentLabel) => {
    for (const f of list || []) {
      if (!f || typeof f !== "object") continue;
      if (f.type === "repeater") {
        const nested = check(f.columns, f.label || f.key);
        if (nested) return nested;
        continue;
      }
      if (f.edit_rule == null) continue;
      const name = `“${f.label || f.key}”${parentLabel ? ` (in “${parentLabel}”)` : ""}`;
      if (!isDateField(f)) continue; // ignored on other types
      const rule = f.edit_rule;
      if (typeof rule !== "object" || (rule.mode != null && !DATE_EDIT_MODES.includes(rule.mode))) {
        return `${name} has a date rule that couldn't be read. Open the field and set “Who can change this date” again.`;
      }
      if (rule.past_days != null && rule.past_days !== "") {
        const n = Number(rule.past_days);
        if (!Number.isInteger(n) || n < 0) {
          return `${name}: “Allow past dates up to” must be a whole number of days (0 or more).`;
        }
      }
    }
    return null;
  };
  return check(fields, null);
}
