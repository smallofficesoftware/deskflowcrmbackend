/**
 * generateJanToMay2026.js
 *
 * Generates a full 5-month (Jan-May 2026) realistic test dataset for 8
 * employees with distinct payroll configs, covering every day_status,
 * every salary_type/calc_mode combination, both OT rate paths, compensation
 * credit/debit, leave override vs non-override, new-joiner sparse data,
 * multi-segment punches, and dangling unclosed punches.
 *
 * See DESIGN.md for the full rationale per employee/month.
 */
import fs from "fs-extra";
import path from "path";


const COMPANY_ID = 2;
const EMP_IDS = [2, 10, 11, 2766, 2767, 2768, 2769, 2770];

let attendanceId = 1;
let compensationId = 1;
let leaveId = 1;
let holidayId = 1;

const attendanceRows = [];
const compensationRows = [];
const leaveRows = [];
const holidayRows = [];
const payrollRows = [];

// ── Helpers ──────────────────────────────────────────────────────────────

function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function dateStr(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dayOfWeek(year, month, day) {
    return new Date(year, month - 1, day).getDay(); // 0=Sun...6=Sat
}

function ts(date, time) {
    return `${date} ${time}`;
}

function addPunch(empId, date, time, status) {
    attendanceRows.push({
        attendance_status: status,
        a_application_login_id: empId,
        check_in_out_date_time: ts(date, time),
        total_working_hour: "00:00:00",
        created_date_time: ts(date, time),
        s_timestemp: ts(date, time),
        isDelete: 0,
        attendance_entry_flag: 1,
        image_url: "",
        remark: "",
        updated_by: 0,
        isActive: 1,
        company_masters_id: COMPANY_ID,
    });
}

function addInOut(empId, date, inTime, outTime) {
    addPunch(empId, date, inTime, 1);
    addPunch(empId, date, outTime, 2);
}

function addCompensation(empId, date, adjustmentType, hours, remark) {
    compensationRows.push({
        company_masters_id: COMPANY_ID,
        a_application_login_id: empId,
        employee_id: empId,
        adjustment_type: adjustmentType,
        amount: 0,
        hours,
        apply_date: date,
        remark,
        s_timestemp: ts(date, "10:31:12"),
        isDelete: 0,
        isActive: 1,
    });
}

function addLeave(empId, date, leaveStatus, remark) {
    leaveRows.push({
        leave_type_id: 1,
        leave_date: date,
        reporting_date: date,
        leave_duration: 1,
        remark,
        status_remark: null,
        attachment: "",
        leave_status: leaveStatus, // 1 = pending, 2 = approved
        hourly_leave_duration: "00:00",
        created_by: empId,
        company_masters_id: COMPANY_ID,
        a_application_login_id: empId,
        created_date_time: ts(date, "07:13:34"),
        s_timestemp: ts(date, "07:13:34"),
        isDelete: 0,
        isActive: 1,
    });
}

function addHoliday(empId, date, remark) {
    holidayRows.push({
        holiday_date: date,
        holiday_remark: remark,
        company_masters_id: COMPANY_ID,
        a_application_login_id: empId,
        s_timestemp: ts(date, "07:42:55"),
        isDelete: 0,
        isActive: 1,
    });
}

function addPayroll(empId, overrides = {}) {
    payrollRows.push({
        employee_id: String(empId),
        daily_in_time: "09:00:00",
        daily_out_time: "18:00:00",
        daily_working_hours: "09:00",
        daily_break_hours: "01:00",
        min_present_hours: "08:00",
        half_day_hours: "04:00",
        grace_period: "15",
        compulsary_attendance: 0,
        compulsary_attendance_image: 0,
        week_off_days: "0",
        face_ids: "",
        salary_type: 3,
        salary_amount_type_wise: 0,
        salary_cal_month_count: 1,
        min_overtime_hours: "01:00:00",
        overtime_amount_per_hour: 0,
        approve_ot_hours: "00:00:00",
        sandwich_rule_applied: 0,
        sandwich_rule_type: 0,
        bonus_type: 1,
        salary_cal_month_count: 1,
        bonus_percentage: 8.33,
        performance_incentive: 0,
        earning_first: 0,
        earning_second: 0,
        earning_third: 0,
        deduction_first: 0,
        deduction_second: 0,
        deduction_third: 0,
        pf_percentage: 12,
        company_pf_percentage: 12,
        pm_pf_percentage: 12,
        tds_percentage: 0,
        insurance_amount: 0,
        pt_amount: 150,
        esi_company_side: 3.25,
        esi_employee_side_percentage: 0.75,
        gratuity_calculation: 0,
        basic_da: 0,
        hra: 0,
        ctc: 0,
        medical_allowance: 0,
        conveyance_allowance: 0,
        special_allowance: 0,
        company_masters_id: COMPANY_ID,
        a_application_login_id: empId,
        ...overrides,
    });
}

/**
 * Fills an ordinary working pattern for a full month for one employee:
 * present on all non-week-off days, with optional per-date overrides.
 *
 * weekOffDays: array of day-of-week ints (0=Sun...6=Sat)
 * overridesByDay: { [day]: 'absent' | 'half' | 'leave_approved' | 'leave_pending' | 'skip' | [inTime,outTime] | 'dangling' | [[in,out],[in,out],...] }
 */
function fillOrdinaryMonth(empId, year, month, weekOffDays, overridesByDay = {}) {
    const numDays = daysInMonth(year, month);

    for (let day = 1; day <= numDays; day++) {
        const date = dateStr(year, month, day);
        const dow = dayOfWeek(year, month, day);
        const isWeekOff = weekOffDays.includes(dow);
        const override = overridesByDay[day];

        if (override === "skip") {
            continue; // no punches, no leave - tests skip-row logic on ordinary non-week-off days
        }

        if (override === "leave_approved") {
            addLeave(empId, date, 2, "approved leave");
            continue;
        }

        if (override === "leave_pending") {
            addLeave(empId, date, 1, "pending leave");
            continue;
        }

        if (override === "absent") {
            addInOut(empId, date, "09:00:00", "10:00:00"); // short punch -> absent
            continue;
        }

        if (override === "half") {
            addInOut(empId, date, "09:00:00", "13:00:00"); // short day -> half day
            continue;
        }

        if (override === "dangling") {
            addPunch(empId, date, "09:00:00", 1); // IN with no OUT
            continue;
        }

        if (Array.isArray(override) && Array.isArray(override[0])) {
            // multi-segment: [[in,out],[in,out],...]
            for (const [inT, outT] of override) {
                addInOut(empId, date, inT, outT);
            }
            continue;
        }

        if (Array.isArray(override) && typeof override[0] === "string") {
            // single custom [in, out] pair
            addInOut(empId, date, override[0], override[1]);
            continue;
        }

        if (isWeekOff) {
            // Ordinary week-off day, no punches -> resolves to WEEK_OFF in the engine
            continue;
        }

        // Default: ordinary present day
        addInOut(empId, date, "09:00:00", "18:00:00");
    }
}

// ══════════════════════════════════════════════════════════════════════
// PAYROLL CONFIGS (8 distinct profiles)
// ══════════════════════════════════════════════════════════════════════

addPayroll(2, {
    salary_type: 3, salary_cal_month_count: 1, week_off_days: "0",
    ctc: 600000, basic_da: 25000, hra: 10000,
    conveyance_allowance: 1600, medical_allowance: 1250, special_allowance: 2150,
    pf_percentage: 12, pm_pf_percentage: 12, esi_employee_side_percentage: 0.75, esi_company_side: 3.25,
    pt_amount: 200, insurance_amount: 500, bonus_percentage: 8.33, overtime_amount_per_hour: 0,
    earning_first: 1000, earning_second: 500, earning_third: 0,
    deduction_first: 200, deduction_second: 0, deduction_third: 0,
});

addPayroll(10, {
    salary_type: 2, salary_cal_month_count: 2, week_off_days: "0",
    salary_amount_type_wise: 35000, basic_da: 18000, hra: 7000,
    conveyance_allowance: 1200, medical_allowance: 1000, special_allowance: 1500,
    pf_percentage: 12, pm_pf_percentage: 12, esi_employee_side_percentage: 0.75, esi_company_side: 3.25,
    pt_amount: 150, insurance_amount: 300, bonus_percentage: 8.33, overtime_amount_per_hour: 150,
    earning_first: 0, earning_second: 0, earning_third: 0,
    deduction_first: 0, deduction_second: 0, deduction_third: 0,
});

addPayroll(11, {
    salary_type: 1, salary_cal_month_count: 3, week_off_days: "0,6",
    salary_amount_type_wise: 250, basic_da: 15000, hra: 6000,
    conveyance_allowance: 1000, medical_allowance: 800, special_allowance: 1200,
    pf_percentage: 12, pm_pf_percentage: 12, esi_employee_side_percentage: 0.75, esi_company_side: 3.25,
    pt_amount: 150, insurance_amount: 250, bonus_percentage: 8.33, overtime_amount_per_hour: 0,
    earning_first: 500, earning_second: 0, earning_third: 0,
    deduction_first: 100, deduction_second: 0, deduction_third: 0,
});

addPayroll(2766, {
    salary_type: 3, salary_cal_month_count: 2, week_off_days: "0",
    ctc: 900000, basic_da: 38000, hra: 15000,
    conveyance_allowance: 2000, medical_allowance: 1500, special_allowance: 3000,
    pf_percentage: 12, pm_pf_percentage: 12, esi_employee_side_percentage: 0.75, esi_company_side: 3.25,
    pt_amount: 200, insurance_amount: 800, bonus_percentage: 8.33, overtime_amount_per_hour: 200,
    earning_first: 1500, earning_second: 0, earning_third: 0,
    deduction_first: 0, deduction_second: 0, deduction_third: 0,
});

addPayroll(2767, {
    salary_type: 2, salary_cal_month_count: 1, week_off_days: "0,6",
    salary_amount_type_wise: 12500, basic_da: 8500, hra: 2000,
    conveyance_allowance: 500, medical_allowance: 400, special_allowance: 300,
    pf_percentage: 12, pm_pf_percentage: 12, esi_employee_side_percentage: 0.75, esi_company_side: 3.25,
    pt_amount: 0, insurance_amount: 0, bonus_percentage: 8.33, overtime_amount_per_hour: 0,
    earning_first: 0, earning_second: 0, earning_third: 0,
    deduction_first: 0, deduction_second: 0, deduction_third: 0,
});

addPayroll(2768, {
    salary_type: 1, salary_cal_month_count: 1, week_off_days: "0",
    salary_amount_type_wise: 180, basic_da: 16000, hra: 6500,
    conveyance_allowance: 900, medical_allowance: 700, special_allowance: 900,
    pf_percentage: 12, pm_pf_percentage: 12, esi_employee_side_percentage: 0.75, esi_company_side: 3.25,
    pt_amount: 150, insurance_amount: 300, bonus_percentage: 8.33, overtime_amount_per_hour: 180,
    earning_first: 0, earning_second: 0, earning_third: 0,
    deduction_first: 0, deduction_second: 0, deduction_third: 0,
});

addPayroll(2769, {
    salary_type: 3, salary_cal_month_count: 3, week_off_days: "0,6",
    ctc: 500000, basic_da: 22000, hra: 9000,
    conveyance_allowance: 1300, medical_allowance: 1000, special_allowance: 1700,
    pf_percentage: 12, pm_pf_percentage: 12, esi_employee_side_percentage: 0.75, esi_company_side: 3.25,
    pt_amount: 200, insurance_amount: 400, bonus_percentage: 8.33, overtime_amount_per_hour: 0,
    earning_first: 0, earning_second: 0, earning_third: 0,
    deduction_first: 0, deduction_second: 0, deduction_third: 0,
});

addPayroll(2770, {
    salary_type: 2, salary_cal_month_count: 2, week_off_days: "0",
    salary_amount_type_wise: 28000, basic_da: 16500, hra: 6200,
    conveyance_allowance: 1000, medical_allowance: 900, special_allowance: 1100,
    pf_percentage: 12, pm_pf_percentage: 12, esi_employee_side_percentage: 0.75, esi_company_side: 3.25,
    pt_amount: 150, insurance_amount: 250, bonus_percentage: 8.33, overtime_amount_per_hour: 120,
    earning_first: 0, earning_second: 0, earning_third: 0,
    deduction_first: 0, deduction_second: 0, deduction_third: 0,
});

// ══════════════════════════════════════════════════════════════════════
// HOLIDAYS (per month, all employees)
// ══════════════════════════════════════════════════════════════════════

const HOLIDAYS = {
    1: "2026-01-26", // Republic Day (Mon)
    2: "2026-02-14", // regional holiday (Sat)
    3: "2026-03-20", // festival (Fri)
    4: "2026-04-10", // festival (Fri)
    5: "2026-05-01", // Labour Day (Fri)
};

for (const month of [1, 2, 3, 4, 5]) {
    for (const empId of EMP_IDS) {
        addHoliday(empId, HOLIDAYS[month], `Holiday ${HOLIDAYS[month]}`);
    }
}

// ══════════════════════════════════════════════════════════════════════
// MONTHLY ATTENDANCE PATTERNS
// ══════════════════════════════════════════════════════════════════════

const WEEK_OFF = { SUN: [0], SAT_SUN: [0, 6] };

// ---------- JANUARY 2026 ----------
fillOrdinaryMonth(2, 2026, 1, WEEK_OFF.SUN, { 7: "absent", 14: "half" });
fillOrdinaryMonth(10, 2026, 1, WEEK_OFF.SUN, { 9: "leave_approved" });
fillOrdinaryMonth(11, 2026, 1, WEEK_OFF.SAT_SUN, { 20: "absent" });
fillOrdinaryMonth(2766, 2026, 1, WEEK_OFF.SUN, {});
fillOrdinaryMonth(2767, 2026, 1, WEEK_OFF.SAT_SUN, { 12: "half", 21: "absent" });
fillOrdinaryMonth(2768, 2026, 1, WEEK_OFF.SUN, {});
fillOrdinaryMonth(2769, 2026, 1, WEEK_OFF.SAT_SUN, { 15: "leave_approved", 16: "leave_approved" });
// 2770: new joiner mid-month. Days 1-14 -> no rows at all (skip), starts Jan 15.
{
    const skipMap = {};
    for (let d = 1; d <= 14; d++) skipMap[d] = "skip";
    fillOrdinaryMonth(2770, 2026, 1, WEEK_OFF.SUN, skipMap);
}

// ---------- FEBRUARY 2026 ----------
fillOrdinaryMonth(2, 2026, 2, WEEK_OFF.SUN, {});
fillOrdinaryMonth(10, 2026, 2, WEEK_OFF.SUN, {});
{
    // Employee 11 works a Saturday week-off on Feb 7 -> WOWO
    fillOrdinaryMonth(11, 2026, 2, WEEK_OFF.SAT_SUN, { 7: ["09:00:00", "13:00:00"] });
}
fillOrdinaryMonth(2766, 2026, 2, WEEK_OFF.SUN, { 18: "half" });
fillOrdinaryMonth(2767, 2026, 2, WEEK_OFF.SAT_SUN, {});
fillOrdinaryMonth(2768, 2026, 2, WEEK_OFF.SUN, { 23: "absent" });
{
    // Employee 2769 takes a full week of approved leave Feb 9-13
    const overrides = {};
    for (let d = 9; d <= 13; d++) overrides[d] = "leave_approved";
    fillOrdinaryMonth(2769, 2026, 2, WEEK_OFF.SAT_SUN, overrides);
}
fillOrdinaryMonth(2770, 2026, 2, WEEK_OFF.SUN, {});

// ---------- MARCH 2026 ----------
{
    // Employee 2: compensation credit AND debit both this month
    fillOrdinaryMonth(2, 2026, 3, WEEK_OFF.SUN, {});
    addCompensation(2, "2026-03-10", 1, 2, "credit 2h - March test");
    addCompensation(2, "2026-03-18", 2, 1, "debit 1h - March test");
}
fillOrdinaryMonth(10, 2026, 3, WEEK_OFF.SUN, { 25: "half" });
fillOrdinaryMonth(11, 2026, 3, WEEK_OFF.SAT_SUN, {});
fillOrdinaryMonth(2766, 2026, 3, WEEK_OFF.SUN, {});
{
    // Employee 2767: pending (non-approved) leave should NOT override
    fillOrdinaryMonth(2767, 2026, 3, WEEK_OFF.SAT_SUN, { 16: "leave_pending" });
}
fillOrdinaryMonth(2768, 2026, 3, WEEK_OFF.SUN, {});
fillOrdinaryMonth(2769, 2026, 3, WEEK_OFF.SAT_SUN, { 5: "absent" });
fillOrdinaryMonth(2770, 2026, 3, WEEK_OFF.SUN, { 30: "half" });

// ---------- APRIL 2026 ----------
fillOrdinaryMonth(2, 2026, 4, WEEK_OFF.SUN, {
    // late-in exactly within grace (9:15) and beyond grace (9:40)
    8: ["09:15:00", "18:00:00"],
    9: ["09:40:00", "18:00:00"],
});
fillOrdinaryMonth(10, 2026, 4, WEEK_OFF.SUN, {});
fillOrdinaryMonth(11, 2026, 4, WEEK_OFF.SAT_SUN, {
    // early-out exactly within grace (17:45) and beyond grace (17:20)
    14: ["09:00:00", "17:45:00"],
    15: ["09:00:00", "17:20:00"],
});
fillOrdinaryMonth(2766, 2026, 4, WEEK_OFF.SUN, {});
fillOrdinaryMonth(2767, 2026, 4, WEEK_OFF.SAT_SUN, { 20: "absent" });
{
    // Employee 2768 works the holiday itself (Apr 10) -> WOPH
    fillOrdinaryMonth(2768, 2026, 4, WEEK_OFF.SUN, { 10: ["09:00:00", "14:00:00"] });
}
fillOrdinaryMonth(2769, 2026, 4, WEEK_OFF.SAT_SUN, {});
fillOrdinaryMonth(2770, 2026, 4, WEEK_OFF.SUN, { 22: "half" });

// ---------- MAY 2026 ----------
fillOrdinaryMonth(2, 2026, 5, WEEK_OFF.SUN, {});
fillOrdinaryMonth(10, 2026, 5, WEEK_OFF.SUN, {});
fillOrdinaryMonth(11, 2026, 5, WEEK_OFF.SAT_SUN, {});
{
    // Employee 2766: multi-segment punch day (3 IN/OUT pairs) on May 12
    fillOrdinaryMonth(2766, 2026, 5, WEEK_OFF.SUN, {
        12: [["09:00:00", "12:00:00"], ["12:30:00", "16:00:00"], ["16:15:00", "18:00:00"]],
    });
}
fillOrdinaryMonth(2767, 2026, 5, WEEK_OFF.SAT_SUN, {});
fillOrdinaryMonth(2768, 2026, 5, WEEK_OFF.SUN, {});
fillOrdinaryMonth(2769, 2026, 5, WEEK_OFF.SAT_SUN, { 8: "leave_approved" });
{
    // Employee 2770: dangling unclosed IN near month-end (May 28)
    fillOrdinaryMonth(2770, 2026, 5, WEEK_OFF.SUN, { 28: "dangling" });
}

// ── Write JSON outputs ──────────────────────────────────────────────────

const outDir = __dirname;
fs.writeFileSync(path.join(outDir, "attendance_test_data.json"), JSON.stringify(attendanceRows, null, 2));
fs.writeFileSync(path.join(outDir, "compensation_test_data.json"), JSON.stringify(compensationRows, null, 2));
fs.writeFileSync(path.join(outDir, "leave_test_data.json"), JSON.stringify(leaveRows, null, 2));
fs.writeFileSync(path.join(outDir, "holiday_test_data.json"), JSON.stringify(holidayRows, null, 2));
fs.writeFileSync(path.join(outDir, "payroll_test_data.json"), JSON.stringify(payrollRows, null, 2));

console.log(`Generated:
  ${attendanceRows.length} attendance rows
  ${compensationRows.length} compensation rows
  ${leaveRows.length} leave rows
  ${holidayRows.length} holiday rows
  ${payrollRows.length} payroll rows`);