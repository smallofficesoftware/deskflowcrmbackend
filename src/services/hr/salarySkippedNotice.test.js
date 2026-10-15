import assert from "node:assert/strict";
import { buildSalaryProcessResult, SALARY_SUCCESS_MESSAGE } from "./salarySkippedNotice.js";

// nobody skipped: message unchanged
const ok = buildSalaryProcessResult(10, []);
assert.equal(ok.ack_msg, SALARY_SUCCESS_MESSAGE);
assert.deepEqual(ok.data, { processed_count: 10, skipped_employees: [], warnings: [] });
assert.equal(buildSalaryProcessResult(3).ack_msg, SALARY_SUCCESS_MESSAGE);

// some skipped: names, counts and the next step are in the message
const r = buildSalaryProcessResult(8, [{ id: 5, name: "Asha" }, { id: 9, name: "Ravi" }]);
assert.match(r.ack_msg, /^Salary calculated for 8 employees\./);
assert.match(r.ack_msg, /2 skipped because Employee Payroll is not set up: Asha, Ravi\./);
assert.match(r.ack_msg, /run Salary Process again\.$/);
assert.deepEqual(r.data.skipped_employees, [{ id: 5, name: "Asha" }, { id: 9, name: "Ravi" }]);
assert.equal(r.data.processed_count, 8);

// singular wording, and a missing name falls back to the id
const one = buildSalaryProcessResult(1, [{ id: 42 }]);
assert.match(one.ack_msg, /^Salary calculated for 1 employee\./);
assert.match(one.ack_msg, /Employee #42/);
assert.deepEqual(one.data.skipped_employees, [{ id: 42, name: "" }]);

// a long list is cut in the message but complete in the data
const many = Array.from({ length: 13 }, (_, i) => ({ id: i + 1, name: `E${i + 1}` }));
const m = buildSalaryProcessResult(0, many);
assert.match(m.ack_msg, /13 skipped/);
assert.match(m.ack_msg, /E10 and 3 more\./);
assert.doesNotMatch(m.ack_msg, /E11/);
assert.equal(m.data.skipped_employees.length, 13);
assert.match(m.ack_msg, /^Salary calculated for 0 employees\./);


// warnings only: processed count, then a "Check:" list with the reasons
const w = buildSalaryProcessResult(3, [], [
  { id: 1, name: "Bansi", reasons: ["Per Day Salary is not set in Employee Payroll"] },
  { id: 2, name: "Keval", reasons: ["2 days have no attendance result, run Process Attendance again", "no payable days counted this month"] },
]);
assert.equal(
  w.ack_msg,
  "Salary calculated for 3 employees. Check: Bansi (Per Day Salary is not set in Employee Payroll), " +
  "Keval (2 days have no attendance result, run Process Attendance again; no payable days counted this month).",
);
assert.equal(w.data.warnings.length, 2);
assert.deepEqual(w.data.skipped_employees, []);

// skipped and warnings together
const both = buildSalaryProcessResult(5, [{ id: 9, name: "Ravi" }], [{ id: 1, name: "Bansi", reasons: ["x"] }]);
assert.match(both.ack_msg, /1 skipped because Employee Payroll is not set up: Ravi\. .* Check: Bansi \(x\)\.$/);

// a long warning list is cut in the message but complete in the data
const manyW = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `E${i + 1}`, reasons: ["r"] }));
const mw = buildSalaryProcessResult(12, [], manyW);
assert.match(mw.ack_msg, /E10 \(r\) and 2 more\./);
assert.doesNotMatch(mw.ack_msg, /E11/);
assert.equal(mw.data.warnings.length, 12);

console.log("salarySkippedNotice tests passed");
