// Recurring forms (plan item Q1/Q2): "fill this form every day / on these
// weekdays / on this day of the month". Pure module, no imports — dates are
// plain "YYYY-MM-DD" strings in the company's day (IST), so a due date never
// shifts with a server time zone.
//
// Entries are created lazily: whenever someone opens "Forms due today" or the
// missed list, the entries from the day after the last generated day up to
// today are created (idempotent), so nothing depends on a nightly job having
// run. MAX_CATCH_UP_DAYS keeps a very old start date from creating years of
// entries at once.

export const SCHEDULE_FREQUENCIES = ["daily", "weekly", "monthly"];
export const MAX_CATCH_UP_DAYS = 62;
export const MAX_ASSIGNEES = 200;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(dateStr) {
  const m = DATE_PATTERN.exec(String(dateStr));
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (dt.getUTCFullYear() !== Number(m[1]) || dt.getUTCMonth() !== Number(m[2]) - 1 || dt.getUTCDate() !== Number(m[3])) return null;
  return dt;
}

function fmt(dt) {
  return dt.toISOString().slice(0, 10);
}

export function isValidDateString(value) {
  return toUtc(value) !== null;
}

export function addDays(dateStr, days) {
  const dt = toUtc(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fmt(dt);
}

export function maxDate(a, b) {
  return a >= b ? a : b;
}

export function minDate(a, b) {
  return a <= b ? a : b;
}

function daysInMonth(year, month1) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

// Does this schedule fall due on this day?
export function isDueOn(schedule, dateStr) {
  const dt = toUtc(dateStr);
  if (!dt) return false;
  switch (schedule.frequency) {
    case "daily":
      return true;
    case "weekly":
      return (schedule.weekdays || []).includes(dt.getUTCDay());
    case "monthly": {
      // "31st" in a 30-day month falls on the last day instead of being skipped.
      const day = Math.min(Number(schedule.day_of_month), daysInMonth(dt.getUTCFullYear(), dt.getUTCMonth() + 1));
      return dt.getUTCDate() === day;
    }
    default:
      return false;
  }
}

// Due dates from `from` to `to`, both included, inside the schedule's own
// start/end dates.
export function dueDates(schedule, from, to) {
  const start = maxDate(from, schedule.start_date);
  const end = schedule.end_date ? minDate(to, schedule.end_date) : to;
  const out = [];
  if (!toUtc(start) || !toUtc(end)) return out;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isDueOn(schedule, d)) out.push(d);
    if (out.length > 400) break; // safety net, never reached with MAX_CATCH_UP_DAYS
  }
  return out;
}

// The stretch of days still to create entries for: the day after the last
// generated day (or the start date) up to today, at most MAX_CATCH_UP_DAYS back.
// Returns null when there is nothing to create.
export function catchUpRange(schedule, today) {
  const earliest = addDays(today, -MAX_CATCH_UP_DAYS);
  let from = schedule.last_generated_date ? addDays(schedule.last_generated_date, 1) : schedule.start_date;
  from = maxDate(from, maxDate(schedule.start_date, earliest));
  const to = schedule.end_date ? minDate(today, schedule.end_date) : today;
  return from <= to ? { from, to } : null;
}

// done: filled. due: not filled yet and not late (today). missed: not filled
// and the day has passed.
export function entryState(entry, today) {
  if (entry.submission_id) return "done";
  return entry.due_date < today ? "missed" : "due";
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Body of the "save schedule" call -> { value } or { error }.
export function parseScheduleInput(body) {
  const b = body || {};
  const title = String(b.title ?? "").trim();
  if (!title) return { error: "Give the schedule a name, like “Daily machine check”" };
  if (title.length > 150) return { error: "The schedule name is too long (150 characters at most)" };

  if (!SCHEDULE_FREQUENCIES.includes(b.frequency)) return { error: "Choose how often the form repeats: daily, weekly or monthly" };

  let weekdays = null;
  if (b.frequency === "weekly") {
    const list = Array.isArray(b.weekdays) ? b.weekdays.map(Number) : [];
    if (!list.length || list.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return { error: "Pick at least one weekday" };
    weekdays = [...new Set(list)].sort((x, y) => x - y);
  }

  let dayOfMonth = null;
  if (b.frequency === "monthly") {
    dayOfMonth = Number(b.day_of_month);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return { error: "Pick the day of the month (1 to 31)" };
  }

  const ids = (Array.isArray(b.assignee_login_ids) ? b.assignee_login_ids : []).map(positiveInt).filter(Boolean);
  const assignees = [...new Set(ids)];
  if (!assignees.length) return { error: "Choose at least one person who has to fill this form" };
  if (assignees.length > MAX_ASSIGNEES) return { error: `Too many people (${MAX_ASSIGNEES} at most)` };

  if (!isValidDateString(b.start_date)) return { error: "Choose the date the schedule starts" };
  let endDate = null;
  if (b.end_date != null && b.end_date !== "") {
    if (!isValidDateString(b.end_date)) return { error: "The end date is not a valid date" };
    if (b.end_date < b.start_date) return { error: "The end date can't be before the start date" };
    endDate = b.end_date;
  }

  return {
    value: {
      title,
      frequency: b.frequency,
      weekdays,
      day_of_month: dayOfMonth,
      assignee_login_ids: assignees,
      start_date: b.start_date,
      end_date: endDate,
    },
  };
}

export function serializeWeekdays(weekdays) {
  return weekdays && weekdays.length ? weekdays.join(",") : null;
}

export function parseWeekdays(text) {
  if (text == null || text === "") return [];
  return String(text)
    .split(",")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}
