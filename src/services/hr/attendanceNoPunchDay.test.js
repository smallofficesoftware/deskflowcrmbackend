import assert from "node:assert/strict";
import { shouldSkipDay } from "./attendanceNoPunchDay.js";

const payroll = { daily_working_hours: "08:00" };
const day = { payroll, records: [], leave_list: [], isWeekOffDay: false, isHolidayDay: false };

// working day, no punch, no leave, payroll set -> not skipped, so it is written as Absent
assert.equal(shouldSkipDay(day), false);

// no payroll -> nothing to calculate a status from, still skipped
assert.equal(shouldSkipDay({ ...day, payroll: undefined }), true);
assert.equal(shouldSkipDay({ ...day, payroll: null }), true);

// punch, leave, week off or holiday were never skipped
assert.equal(shouldSkipDay({ ...day, records: [{}] }), false);
assert.equal(shouldSkipDay({ ...day, leave_list: [{}] }), false);
assert.equal(shouldSkipDay({ ...day, isWeekOffDay: true }), false);
assert.equal(shouldSkipDay({ ...day, isHolidayDay: true }), false);
assert.equal(shouldSkipDay({ ...day, payroll: undefined, records: [{}] }), false);

console.log("attendanceNoPunchDay tests passed");
