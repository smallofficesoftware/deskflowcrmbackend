import assert from "node:assert/strict";
import { normalizeRange, targetWindow, windowBounds, windowKey } from "./targetIncentiveDates.js";

// ── normalizeRange ──
assert.deepEqual(normalizeRange(["2026-10-01", "2026-10-31"]), { start: "2026-10-01", end: "2026-10-31" });
assert.deepEqual(normalizeRange([new Date(2026, 9, 1), new Date(2026, 9, 31)]), { start: "2026-10-01", end: "2026-10-31" });
assert.deepEqual(normalizeRange(["2026-10-31", "2026-10-01"]), { start: "2026-10-01", end: "2026-10-31" }); // swapped
assert.equal(normalizeRange([]), null);
assert.equal(normalizeRange(undefined), null);
assert.equal(normalizeRange(["2026-10-01"]), null);
assert.equal(normalizeRange(["", ""]), null);
assert.equal(normalizeRange(["not a date", "2026-10-31"]), null);

const oct = { start: "2026-10-01", end: "2026-10-31" };

// ── targetWindow: overlap ──
// the targets from the demo database against "October 2026": none overlap
for (const [from, to] of [["2026-06-01", "2026-06-30"], ["2025-11-01", "2025-11-30"], ["2025-09-01", "2025-09-30"]]) {
    assert.equal(targetWindow({ target_fromdate: from, target_todate: to }, oct), null, `${from}..${to}`);
}
// same month: counted over the month
assert.deepEqual(targetWindow({ target_fromdate: "2026-10-01", target_todate: "2026-10-31" }, oct), oct);
// a target that starts before and ends inside: clipped to the range start
assert.deepEqual(targetWindow({ target_fromdate: "2026-09-15", target_todate: "2026-10-10" }, oct), { start: "2026-10-01", end: "2026-10-10" });
// starts inside, ends after: clipped to the range end
assert.deepEqual(targetWindow({ target_fromdate: "2026-10-20", target_todate: "2026-12-31" }, oct), { start: "2026-10-20", end: "2026-10-31" });
// target period covers the whole range
assert.deepEqual(targetWindow({ target_fromdate: "2026-01-01", target_todate: "2026-12-31" }, oct), oct);
// touching on a single day counts as overlap
assert.deepEqual(targetWindow({ target_fromdate: "2026-09-01", target_todate: "2026-10-01" }, oct), { start: "2026-10-01", end: "2026-10-01" });
assert.equal(targetWindow({ target_fromdate: "2026-09-01", target_todate: "2026-09-30" }, oct), null);
// a wide range lists a monthly target and counts it over its own month only
assert.deepEqual(
    targetWindow({ target_fromdate: "2026-06-01", target_todate: "2026-06-30" }, { start: "2026-01-01", end: "2026-12-31" }),
    { start: "2026-06-01", end: "2026-06-30" },
);

// ── targetWindow: open-ended targets and no range ──
assert.deepEqual(targetWindow({ target_fromdate: "", target_todate: "" }, oct), oct);
assert.deepEqual(targetWindow({ target_fromdate: "0000-00-00", target_todate: "0000-00-00" }, oct), oct);
assert.deepEqual(targetWindow({}, oct), oct);
assert.deepEqual(targetWindow({ target_fromdate: "2026-10-15", target_todate: null }, oct), { start: "2026-10-15", end: "2026-10-31" });
assert.deepEqual(targetWindow({ target_fromdate: "2025-11-01", target_todate: "2025-11-30" }, null), { start: null, end: null });

// ── windowKey / windowBounds ──
assert.equal(windowKey({ start: "2026-10-01", end: "2026-10-31" }), "2026-10-01|2026-10-31");
assert.equal(windowKey({ start: null, end: null }), "|");
assert.equal(windowBounds({ start: null, end: null }), null);
const b = windowBounds({ start: "2026-10-01", end: "2026-10-31" });
assert.equal(b.start.getFullYear() + "-" + (b.start.getMonth() + 1) + "-" + b.start.getDate() + " " + b.start.getHours(), "2026-10-1 0");
assert.equal(b.end.getDate() + " " + b.end.getHours() + ":" + b.end.getMinutes() + ":" + b.end.getSeconds(), "31 23:59:59");

console.log("targetIncentiveDates tests passed");
