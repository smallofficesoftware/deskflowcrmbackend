// Turns the salary slip data (the /salary/monthly-slip rows) into what the slip
// PDF template prints. Mirrors the on-screen slip (SalaryRegisterMonthlySlip.tsx):
// the same rows in the same order, and only these four rows are dropped when
// their value is missing (blank/null/undefined): overtime, PM PF, ESI, insurance.
import moment from "moment";

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

export const monthLabel = (month, year) => {
    const name = MONTH_NAMES[Number(month) - 1];
    return name ? `${name} – ${year}` : `${month} – ${year}`;
};

// "02-10-2026 03:25 pm", same shape as the on-screen slip date.
export const slipDateTime = (now = moment()) => now.format("DD-MM-YYYY hh:mm a");

const isEmpty = (v) => v === "" || v === null || v === undefined;
const show = (v) => (isEmpty(v) ? "" : String(v));

// record: one employee from data.salary of /salary/monthly-slip
// employee: { username, employee_id, recovery_mobile }
export function buildSlipView(record, employee = {}) {
    const earnings = [
        { label: "Basic+DA", value: record.basicda },
        { label: "HRA", value: record.hra },
        { label: "Medi. All", value: record.medi_all },
        { label: "Conv. All", value: record.conv_all },
        { label: "Spe. All", value: record.spe_all },
        { label: "Overtime", value: record.overtime, optional: true },
        { label: "Others", value: record.others_earning },
    ].filter((i) => !i.optional || !isEmpty(i.value));

    const deductions = [
        { label: "PF", value: record.pf },
        { label: "PT", value: record.pt },
        { label: "PM PF", value: record.pm_pf, optional: true },
        { label: "ESI", value: record.esi, optional: true },
        { label: "Insurance", value: record.insurance, optional: true },
        { label: "Others", value: record.others_deduction },
    ].filter((i) => !i.optional || !isEmpty(i.value));

    // The two columns are filtered separately, so zip them into rows the way the screen does.
    const rows = Array.from({ length: Math.max(earnings.length, deductions.length) }, (_, i) => ({
        earningLabel: earnings[i]?.label ?? "",
        earningValue: earnings[i] ? show(earnings[i].value) : "",
        deductionLabel: deductions[i]?.label ?? "",
        deductionValue: deductions[i] ? show(deductions[i].value) : "",
    }));

    return {
        employeeName: employee.username || "",
        employeeNo: employee.employee_id || "",
        contactNumber: employee.recovery_mobile || "",
        totalWorkingDays: show(record.total_working_days),
        leave: show(record.leave),
        payableDays: show(record.payable_days),
        rows,
        remark: show(record.remark),
        gross: show(record.gross),
        totalDeduction: show(record.total_deduction),
        netPayable: show(record.net_payable),
        netPayableInWords: show(record.net_payable_in_word),
    };
}
