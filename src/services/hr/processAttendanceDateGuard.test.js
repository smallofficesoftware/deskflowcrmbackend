import assert from "node:assert/strict";
import moment from "moment";
import { rejectTodayOrFutureDates, TODAY_NOT_ALLOWED_MESSAGE } from "./processAttendanceDateGuard.js";

const now = moment("2026-10-02 10:30:00", "YYYY-MM-DD HH:mm:ss"); // "today" for these tests

// up to yesterday is fine
assert.equal(rejectTodayOrFutureDates("2026-10-01", "2026-10-01", now), null);
assert.equal(rejectTodayOrFutureDates("2026-09-01", "2026-09-30", now), null);

// today is refused, in either field
for (const [from, to] of [["2026-10-01", "2026-10-02"], ["2026-10-02", "2026-10-02"], ["2026-10-02", "2026-10-01"]]) {
    const r = rejectTodayOrFutureDates(from, to, now);
    assert.equal(r.ack, 0);
    assert.equal(r.ack_msg, TODAY_NOT_ALLOWED_MESSAGE);
}

// future dates are refused (e.g. a month range ending on the last day of the month)
assert.equal(rejectTodayOrFutureDates("2026-10-01", "2026-10-31", now).ack, 0);
assert.equal(rejectTodayOrFutureDates("2026-11-01", "2026-11-05", now).ack, 0);

// the 1st of a month: yesterday is the last day of the previous month
const firstOfMonth = moment("2026-11-01 00:05:00", "YYYY-MM-DD HH:mm:ss");
assert.equal(rejectTodayOrFutureDates("2026-10-01", "2026-10-31", firstOfMonth), null);
assert.equal(rejectTodayOrFutureDates("2026-11-01", "2026-11-01", firstOfMonth).ack, 0);

// empty or unparseable values are not this guard's job
assert.equal(rejectTodayOrFutureDates(undefined, undefined, now), null);
assert.equal(rejectTodayOrFutureDates("", "", now), null);
assert.equal(rejectTodayOrFutureDates("not-a-date", "also-not", now), null);

console.log("processAttendanceDateGuard tests passed");
