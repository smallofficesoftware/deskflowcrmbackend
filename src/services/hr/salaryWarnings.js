// Reasons to show the user after Salary Process, for employees whose calculated
// salary is 0 or whose attendance is not ready. Plain text, one string per reason.
import { hasSalaryStructure } from "./salaryRatePay.js";

const SALARY_TYPE = { HOUR_WISE: 1, DAY_WISE: 2, MONTH_WISE: 3 };

const num = (v) => Number(v) || 0;

export function collectSalaryWarnings({ payroll, salaryType, calculated, batchRows = [] }) {
    const reasons = [];

    // Days saved by Process Attendance with no result (status 0) count as nothing in the salary.
    const unmarkedDays = batchRows.filter((r) => Number(r.day_status) === 0).length;
    if (unmarkedDays > 0) {
        reasons.push(
            `${unmarkedDays} day${unmarkedDays === 1 ? "" : "s"} have no attendance result, run Process Attendance again`,
        );
    }

    if (num(calculated?.total_earning) > 0) return reasons;

    // Pay is 0: say which Employee Payroll field is missing, or that no day was counted.
    const rate = num(payroll?.salary_amount_type_wise);
    if (![SALARY_TYPE.HOUR_WISE, SALARY_TYPE.DAY_WISE, SALARY_TYPE.MONTH_WISE].includes(salaryType)) {
        reasons.push("Salary Type is not selected in Employee Payroll");
    } else if (salaryType === SALARY_TYPE.MONTH_WISE) {
        if (!hasSalaryStructure(payroll)) reasons.push("Basic + D.A. (and HRA / allowances) is not set in Employee Payroll");
    } else if (rate <= 0 && !hasSalaryStructure(payroll)) {
        reasons.push(`${salaryType === SALARY_TYPE.HOUR_WISE ? "Per Hour Salary" : "Per Day Salary"} is not set in Employee Payroll`);
    }

    if (!reasons.some((r) => r.includes("Employee Payroll"))) {
        const nothingCounted = salaryType === SALARY_TYPE.HOUR_WISE
            ? num(calculated?.working_hour) === 0
            : num(calculated?.total_day) === 0;
        if (nothingCounted) {
            reasons.push(salaryType === SALARY_TYPE.HOUR_WISE ? "no working hours counted this month" : "no payable days counted this month");
        }
    }

    return reasons;
}
