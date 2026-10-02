// Earnings for hour-wise and day-wise staff.
//
// The Employee Payroll screen only shows the Salary Structure (Basic+DA, HRA,
// allowances) for month-wise staff; hour-wise and day-wise staff get a single
// "Per Hour Salary" / "Per Day Salary" box (salary_amount_type_wise). The salary
// run built earnings from the structure alone, so these staff always got 0.
// This returns the earned base pay from that rate. It applies only when the rate
// is set and no structure is filled in, so anyone who does have a structure keeps
// the existing calculation.

const SALARY_TYPE = { HOUR_WISE: 1, DAY_WISE: 2 };

const num = (v) => Number(v) || 0;
const round2 = (n) => Math.round(n * 100) / 100;

export function hasSalaryStructure(payroll) {
    return ["basic_da", "hra", "conveyance_allowance", "medical_allowance", "special_allowance"]
        .some((key) => num(payroll?.[key]) > 0);
}

// Returns the earned base pay (it goes where dws_basic goes), or null when the
// employee is not paid from a rate and the existing structure-based calculation
// must be used.
//   day-wise  : rate x payable days (same payable-day rule as month-wise).
//   hour-wise : rate x net working hours.
// Overtime is paid separately by calcOvertimePayable only when the overtime type
// is "flat rate" and an hourly overtime amount is set; those hours are taken out
// of the base hours so they are not paid twice.
export function calcRateBasedBasic({ payroll, salaryType, totalDay, netWorkingMins, regularOtMins, extraOtMins }) {
    if (salaryType !== SALARY_TYPE.HOUR_WISE && salaryType !== SALARY_TYPE.DAY_WISE) return null;

    const rate = num(payroll?.salary_amount_type_wise);
    if (rate <= 0 || hasSalaryStructure(payroll)) return null;

    if (salaryType === SALARY_TYPE.DAY_WISE) {
        return round2(rate * num(totalDay));
    }

    const explicitOtRate = num(payroll.overtime_amount_per_hour);
    const regularPaidSeparately = parseInt(payroll.regular_ot_type ?? 1, 10) === 2 && explicitOtRate > 0;
    const extraPaidSeparately = parseInt(payroll.extra_ot_type ?? 2, 10) === 2 && explicitOtRate > 0;
    const separateOtMins = (regularPaidSeparately ? num(regularOtMins) : 0)
        + (extraPaidSeparately ? num(extraOtMins) : 0);

    const paidMins = Math.max(0, num(netWorkingMins) - separateOtMins);
    return round2((rate * paidMins) / 60);
}
