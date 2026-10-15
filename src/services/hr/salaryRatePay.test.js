import assert from "node:assert/strict";
import { calcRateBasedBasic, hasSalaryStructure } from "./salaryRatePay.js";

const HOUR = 1, DAY = 2, MONTH = 3;
const noStructure = { basic_da: 0, hra: 0, conveyance_allowance: 0, medical_allowance: 0, special_allowance: 0 };

// day-wise: rate x payable days
assert.equal(calcRateBasedBasic({ payroll: { ...noStructure, salary_amount_type_wise: 500 }, salaryType: DAY, totalDay: 9 }), 4500);
assert.equal(calcRateBasedBasic({ payroll: { ...noStructure, salary_amount_type_wise: 500 }, salaryType: DAY, totalDay: 0 }), 0);
assert.equal(calcRateBasedBasic({ payroll: { ...noStructure, salary_amount_type_wise: 350.5 }, salaryType: DAY, totalDay: 2.5 }), 876.25);

// hour-wise: rate x net hours (114.2 h at 200 = the demo employee 129 in May)
assert.equal(
    calcRateBasedBasic({ payroll: { ...noStructure, salary_amount_type_wise: 200 }, salaryType: HOUR, netWorkingMins: 114.2 * 60 }),
    22840,
);
assert.equal(calcRateBasedBasic({ payroll: { ...noStructure, salary_amount_type_wise: 100 }, salaryType: HOUR, netWorkingMins: 90 }), 150);

// hour-wise with a flat overtime rate: the extra-OT hours (default type 2) leave the base hours
assert.equal(
    calcRateBasedBasic({
        payroll: { ...noStructure, salary_amount_type_wise: 100, overtime_amount_per_hour: 150 },
        salaryType: HOUR, netWorkingMins: 600, regularOtMins: 0, extraOtMins: 120,
    }),
    800, // (600 - 120) min = 8 h x 100
);
// overtime type is "formula" (1) for the regular bucket: those hours stay in the base hours
assert.equal(
    calcRateBasedBasic({
        payroll: { ...noStructure, salary_amount_type_wise: 100, overtime_amount_per_hour: 150, regular_ot_type: 1 },
        salaryType: HOUR, netWorkingMins: 600, regularOtMins: 60, extraOtMins: 0,
    }),
    1000,
);
// base hours never go negative
assert.equal(
    calcRateBasedBasic({
        payroll: { ...noStructure, salary_amount_type_wise: 100, overtime_amount_per_hour: 150 },
        salaryType: HOUR, netWorkingMins: 60, extraOtMins: 600,
    }),
    0,
);

// not applicable -> null (existing calculation is used)
assert.equal(calcRateBasedBasic({ payroll: { ...noStructure, salary_amount_type_wise: 500 }, salaryType: MONTH, totalDay: 9 }), null);
assert.equal(calcRateBasedBasic({ payroll: { ...noStructure, salary_amount_type_wise: 0 }, salaryType: DAY, totalDay: 9 }), null);
assert.equal(calcRateBasedBasic({ payroll: { ...noStructure, basic_da: 15000, salary_amount_type_wise: 500 }, salaryType: DAY, totalDay: 9 }), null);
assert.equal(calcRateBasedBasic({ payroll: null, salaryType: DAY, totalDay: 9 }), null);

assert.equal(hasSalaryStructure(noStructure), false);
assert.equal(hasSalaryStructure({ ...noStructure, special_allowance: 1 }), true);
assert.equal(hasSalaryStructure(undefined), false);

console.log("salaryRatePay tests passed");
