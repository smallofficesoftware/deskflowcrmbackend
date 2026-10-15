import assert from "node:assert/strict";
import { toJoinDateIso } from "./attendanceJoinDate.js";

assert.equal(toJoinDateIso("2026-06-05"), "2026-06-05");
assert.equal(toJoinDateIso(new Date(2026, 5, 5)), "2026-06-05");

// missing or invalid -> no joining date, so no day is skipped
assert.equal(toJoinDateIso(null), null);
assert.equal(toJoinDateIso(undefined), null);
assert.equal(toJoinDateIso(""), null);
assert.equal(toJoinDateIso("0000-00-00"), null);
assert.equal(toJoinDateIso(new Date(NaN)), null);

// the old expression gave "Invalid date" here, which made every day "before joining"
const joinDate = toJoinDateIso("0000-00-00");
assert.equal(Boolean(joinDate && "2026-10-01" < joinDate), false);

console.log("attendanceJoinDate tests passed");
