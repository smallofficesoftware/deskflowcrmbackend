import assert from "node:assert/strict";
import { hasShiftTime } from "./attendanceShiftTime.js";

for (const real of ["09:30:00", "10:00", "17:12:00", "00:30:00", "23:59:59", "12:00:00"]) assert.equal(hasShiftTime(real), true, real);
for (const unset of ["00:00:00", "00:00", "0:0:0", "", "   ", null, undefined]) assert.equal(hasShiftTime(unset), false, String(unset));

console.log("attendanceShiftTime tests passed");
