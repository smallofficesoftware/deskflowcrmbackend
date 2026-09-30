// Clean values for automation_settings so junk is never stored (and never
// reaches time.js, which would compute a nonsense quiet-hours window).

/** Positive integer, or null for blank / zero / negative / not a number. */
export const numOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** "H:MM" / "HH:MM" with hour 0-23 and minute 0-59, normalised to "HH:MM"; else null. */
export const timeOrNull = (v) => {
  const m = String(v ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

/** "+05:30" style UTC offset (hours 0-14, minutes 0-59); else the default. */
export const timezoneOr = (v, fallback = "+05:30") => {
  const m = String(v ?? "").match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) return fallback;
  return Number(m[2]) <= 14 && Number(m[3]) <= 59 ? v : fallback;
};

/** Business hours { days:[1..7], from, to } or null when from/to are not valid times. */
export const businessHoursOrNull = (v) => {
  if (!v || typeof v !== "object") return null;
  const from = timeOrNull(v.from);
  const to = timeOrNull(v.to);
  if (!from || !to) return null;
  const days = [...new Set([].concat(v.days || []).map(Number).filter((d) => d >= 1 && d <= 7))];
  return { days: days.length ? days : [1, 2, 3, 4, 5, 6, 7], from, to };
};
