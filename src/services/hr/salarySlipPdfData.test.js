import assert from "node:assert/strict";
import moment from "moment";
import { buildSlipView, monthLabel, slipDateTime } from "./salarySlipPdfData.js";

assert.equal(monthLabel(9, 2026), "September – 2026");
assert.equal(monthLabel("10", "2026"), "October – 2026");
assert.equal(monthLabel(13, 2026), "13 – 2026");
assert.equal(slipDateTime(moment("2026-10-02 15:25:00", "YYYY-MM-DD HH:mm:ss")), "02-10-2026 03:25 pm");
assert.equal(slipDateTime(moment("2026-10-02 00:05:00", "YYYY-MM-DD HH:mm:ss")), "02-10-2026 12:05 am");

const record = {
    basicda: 4450.85, hra: 1780.34, medi_all: 0, conv_all: 0, spe_all: 0, overtime: 2513.9, others_earning: 0,
    pf: 0, pt: 0, pm_pf: 0, esi: 0, insurance: 0, others_deduction: 0,
    total_working_days: 26, leave: 0, payable_days: 18, remark: "Salary 9-2026",
    gross: 8745.09, total_deduction: 0, net_payable: 8745, net_payable_in_word: "Eight Thousand Seven Hundred Forty Five Rupees Only",
};
const v = buildSlipView(record, { username: "AYUSHI KORAT", employee_id: "3155", recovery_mobile: "9274044135" });
assert.equal(v.employeeName, "AYUSHI KORAT");
assert.equal(v.employeeNo, "3155");
assert.equal(v.contactNumber, "9274044135");
assert.equal(v.totalWorkingDays, "26");
assert.equal(v.payableDays, "18");
assert.equal(v.netPayable, "8745");
// zero values are shown (only blank ones are dropped): 7 earnings, 6 deductions -> 7 rows
assert.equal(v.rows.length, 7);
assert.deepEqual(v.rows[0], { earningLabel: "Basic+DA", earningValue: "4450.85", deductionLabel: "PF", deductionValue: "0" });
assert.deepEqual(v.rows[4], { earningLabel: "Spe. All", earningValue: "0", deductionLabel: "Insurance", deductionValue: "0" });
assert.deepEqual(v.rows[5], { earningLabel: "Overtime", earningValue: "2513.9", deductionLabel: "Others", deductionValue: "0" });
// 7 earnings but only 6 deductions: the last row has no deduction
assert.deepEqual(v.rows[6], { earningLabel: "Others", earningValue: "0", deductionLabel: "", deductionValue: "" });

// blank optional rows are dropped, and each side is filtered on its own
const sparse = buildSlipView({ ...record, overtime: "", pm_pf: null, esi: undefined, insurance: "" });
assert.equal(sparse.rows.length, 6); // earnings 6, deductions 3 -> 6 rows
assert.equal(sparse.rows[2].deductionLabel, "Others"); // PF, PT, Others
assert.equal(sparse.rows[3].deductionLabel, ""); // deduction column ran out
assert.equal(sparse.rows[3].deductionValue, "");
assert.equal(sparse.rows.some((r) => r.earningLabel === "Overtime"), false);

// missing employee details and values become empty text, not "undefined"
const empty = buildSlipView({});
assert.equal(empty.employeeName, "");
assert.equal(empty.gross, "");
assert.equal(empty.rows[0].earningValue, "");

console.log("salarySlipPdfData tests passed");
