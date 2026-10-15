// Date rules for the Target Incentive report.
//
// Each target has its own period (target_fromdate .. target_todate). The report's
// date filter used to change only the "achieved" figures: every target was listed
// whatever its period, with achieved counted over the selected range. So under
// "Month: October" it still showed June and 2025 targets with October numbers.
//
// Now a target is listed only when its period overlaps the selected range, and its
// achievement is counted over that overlap (its own period clipped to the range).
// A target with no usable period is open-ended: listed for any range, counted over
// the whole range. With no range selected, nothing is filtered (as before).
import moment from "moment";

const DAY = "YYYY-MM-DD";

const isUsableDay = (value) => {
    if (!value || String(value).startsWith("0000-00-00")) return null;
    const day = moment(value);
    return day.isValid() ? day.format(DAY) : null;
};

// selectedDates: [start, end] as sent by the screen (ISO strings or Dates, local calendar days).
// Returns { start, end } as "YYYY-MM-DD", or null when no valid range was given.
export function normalizeRange(selectedDates) {
    if (!Array.isArray(selectedDates) || selectedDates.length !== 2) return null;
    const start = isUsableDay(selectedDates[0]);
    const end = isUsableDay(selectedDates[1]);
    if (!start || !end) return null;
    return start <= end ? { start, end } : { start: end, end: start };
}

// The days a target's achievement is counted over, or null when its period does
// not overlap the range (the target is not listed).
//   range null            -> { start: null, end: null }  (no date limit, as before)
//   target without period -> the range itself
//   otherwise             -> the overlap of the target's period and the range
export function targetWindow(target, range) {
    if (!range) return { start: null, end: null };

    const from = isUsableDay(target?.target_fromdate);
    const to = isUsableDay(target?.target_todate);

    const start = from && from > range.start ? from : range.start;
    const end = to && to < range.end ? to : range.end;

    if (start > end) return null;
    return { start, end };
}

export const windowKey = (window) => `${window.start ?? ""}|${window.end ?? ""}`;

// Query bounds for a window, in the server's local time like the old filter.
export function windowBounds(window) {
    if (!window.start || !window.end) return null;
    return {
        start: new Date(`${window.start}T00:00:00.000`),
        end: new Date(`${window.end}T23:59:59.999`),
    };
}
