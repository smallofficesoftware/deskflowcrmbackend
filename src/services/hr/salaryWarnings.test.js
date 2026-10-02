import assert from "node:assert/strict";
import { collectSalaryWarnings } from "./salaryWarnings.js";

const none = { basic_da: 0, hra: 0, conveyance_allowance: 0, medical_allowance: 0, special_allowance: 0 };
const paid = { total_earning: 5000, total_day: 20, working_hour: 100 };
const zero = { total_earning: 0, total_day: 0, working_hour: 0 };

// nothing to report
assert.deepEqual(collectSalaryWarnings({ payroll: { ...none, salary_amount_type_wise: 500 }, salaryType: 2, calculated: paid, batchRows: [] }), []);

// unmarked attendance days are reported even when the pay is fine
const r1 = collectSalaryWarnings({ payroll: none, salaryType: 3, calculated: paid, batchRows: [{ day_status: 0 }, { day_status: 1 }, { day_status: 0 }] });
assert.deepEqual(r1, ["2 days have no attendance result, run Process Attendance again"]);
assert.match(collectSalaryWarnings({ payroll: none, salaryType: 3, calculated: paid, batchRows: [{ day_status: 0 }] })[0], /^1 day have/);

// zero pay: names the missing field
assert.deepEqual(collectSalaryWarnings({ payroll: none, salaryType: 0, calculated: zero }), ["Salary Type is not selected in Employee Payroll"]);
assert.deepEqual(collectSalaryWarnings({ payroll: { ...none, salary_amount_type_wise: 0 }, salaryType: 1, calculated: zero }), ["Per Hour Salary is not set in Employee Payroll"]);
assert.deepEqual(collectSalaryWarnings({ payroll: { ...none, salary_amount_type_wise: 0 }, salaryType: 2, calculated: zero }), ["Per Day Salary is not set in Employee Payroll"]);
assert.deepEqual(collectSalaryWarnings({ payroll: none, salaryType: 3, calculated: zero }), ["Basic + D.A. (and HRA / allowances) is not set in Employee Payroll"]);

// zero pay with the field set: the reason is attendance
assert.deepEqual(collectSalaryWarnings({ payroll: { ...none, salary_amount_type_wise: 500 }, salaryType: 2, calculated: zero }), ["no payable days counted this month"]);
assert.deepEqual(collectSalaryWarnings({ payroll: { ...none, salary_amount_type_wise: 200 }, salaryType: 1, calculated: { ...zero, total_day: 5 } }), ["no working hours counted this month"]);
assert.deepEqual(collectSalaryWarnings({ payroll: { ...none, basic_da: 15000 }, salaryType: 3, calculated: zero }), ["no payable days counted this month"]);

// both: unmarked days first, then the missing field
const both = collectSalaryWarnings({ payroll: none, salaryType: 3, calculated: zero, batchRows: [{ day_status: 0 }] });
assert.equal(both.length, 2);
assert.match(both[1], /Basic \+ D\.A\./);

console.log("salaryWarnings tests passed");
