import moment from "moment";
import { DEFAULT_TIMEZONE } from "./constants.js";

// Business hours / quiet hours / wait helpers. All times are read in the
// company timezone from automation_settings (13.15), default +05:30.
//
// business_hours JSON: { "days": [1,2,3,4,5,6], "from": "09:30", "to": "18:30" }
//   days use ISO weekday (1 = Monday ... 7 = Sunday)

const hm = (s) => {
  const [h, m] = String(s || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
};

const minutesOf = (m) => m.hours() * 60 + m.minutes();

export const nowIn = (settings) => moment().utcOffset(settings?.timezone || DEFAULT_TIMEZONE);

/** null when now is inside business hours (or none set), else the next start. */
export const nextBusinessMoment = (settings) => {
  const bh = settings?.business_hours;
  const from = hm(bh?.from);
  const to = hm(bh?.to);
  if (!bh || from == null || to == null) return null;
  const days = Array.isArray(bh.days) && bh.days.length ? bh.days.map(Number) : [1, 2, 3, 4, 5, 6, 7];
  const now = nowIn(settings);
  const inside = days.includes(now.isoWeekday()) && minutesOf(now) >= from && minutesOf(now) < to;
  if (inside) return null;
  for (let i = 0; i < 8; i++) {
    const d = now.clone().add(i, "days").startOf("day").add(from, "minutes");
    if (days.includes(d.isoWeekday()) && d.isAfter(now)) return d;
  }
  return null;
};

/** null when sending is allowed now, else the moment quiet hours end. */
export const quietHoursEnd = (settings) => {
  const from = hm(settings?.quiet_hours_from);
  const to = hm(settings?.quiet_hours_to);
  if (from == null || to == null || from === to) return null;
  const now = nowIn(settings);
  const cur = minutesOf(now);
  const inQuiet = from < to ? cur >= from && cur < to : cur >= from || cur < to;
  if (!inQuiet) return null;
  let end = now.clone().startOf("day").add(to, "minutes");
  if (!end.isAfter(now)) end = end.add(1, "day");
  return end;
};

const UNIT = { minutes: "minutes", hours: "hours", days: "days", weeks: "weeks" };

/** Wait node: { amount: 2, unit: "days" } -> Date */
export const addDuration = (amount, unit) =>
  moment().add(Number(amount) || 0, UNIT[unit] || "minutes").toDate();
