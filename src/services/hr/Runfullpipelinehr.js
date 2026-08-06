/**
 * runFullPipeline.js
 *
 * Runs the COMPLETE attendance -> salary pipeline in memory for May 2026,
 * employees 2, 10, 11. Mirrors the real implementations of:
 *   - processAttendance (multi-segment)
 *   - calcDayStatus (week-off / holiday / leave / WOWO / WOPH priority chain)
 *   - calculateEmployeeSalary (full payslip breakdown)
 *
 * Prints two tables: daily attendance results, then monthly salary summary.
 */
import fs from "fs-extra";
import moment, { isMoment } from "moment";
import path from "path";

/* const moment = require("moment");

const fs = require("fs");
const path = require("path"); */

// ============================================================
// SHARED HELPERS
// ============================================================

function timeStrToMinutes(str) {
    if (!str) return 0;
    const parts = String(str).split(":").map(Number);
    const h = Number.isFinite(parts[0]) ? parts[0] : 0;
    const m = Number.isFinite(parts[1]) ? parts[1] : 0;
    return (h * 60) + m;
}

function minutesToTimeStr(mins) {
    const absMins = Math.abs(Math.round(mins));
    const h = String(Math.floor(absMins / 60)).padStart(2, "0");
    const m = String(absMins % 60).padStart(2, "0");
    return `${h}:${m}:00`;
}

function num(v) {
    return Number(v) || 0;
}

function generateDateRange(from, to) {
    const dates = [];
    let cur = isMoment(from, "YYYY-MM-DD");
    const end = moment(to, "YYYY-MM-DD");
    while (cur.isSameOrBefore(end)) {
        dates.push(cur.format("YYYY-MM-DD"));
        cur = cur.add(1, "day");
    }
    return dates;
}

// ============================================================
// ATTENDANCE ENGINE
// ============================================================

function processAttendance(records) {
    const sorted = [...records].sort(
        (a, b) => new Date(a.check_in_out_date_time) - new Date(b.check_in_out_date_time)
    );

    const firstIn = sorted.find(r => r.attendance_status === 1);
    const lastOut = [...sorted].reverse().find(r => r.attendance_status === 2);

    let totalSeconds = 0;
    let pendingIn = null;

    for (const record of sorted) {
        if (record.attendance_status === 1) {
            pendingIn = record;
        } else if (record.attendance_status === 2) {
            if (pendingIn) {
                const ms = new Date(record.check_in_out_date_time) - new Date(pendingIn.check_in_out_date_time);
                if (ms > 0) totalSeconds += Math.floor(ms / 1000);
                pendingIn = null;
            }
        }
    }

    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    const totalWorkingHour = `${h}:${m}:${s}`;

    const entries = sorted.map(r => ({
        check_in_out_date_time: r.check_in_out_date_time,
        attendance_status: r.attendance_status,
        attendance_entry_flag: r.attendance_entry_flag,
        image_url: r.image_url,
        remark: r.remark,
    }));

    return {
        first_in: firstIn?.check_in_out_date_time ?? null,
        last_out: lastOut?.check_in_out_date_time ?? null,
        total_working_hour: totalWorkingHour,
        entries,
    };
}

function calcCompensationMinutes(compensation_list) {
    let list = compensation_list;
    if (typeof list === "string") {
        try { list = JSON.parse(list); } catch { list = []; }
    }
    if (!Array.isArray(list) || list.length === 0) return 0;
    let netMinutes = 0;
    for (const item of list) {
        const hours = num(item.hours);
        const mins = hours * 60;
        if (item.adjustment_type === 1) netMinutes += mins;
        else if (item.adjustment_type === 2) netMinutes -= mins;
    }
    return netMinutes;
}

function calcOvertimeMinutes(netWorkingMins, minPresentMins, halfDayMins, minOvertimeMins) {
    let excessMins = 0;
    if (netWorkingMins > minPresentMins) {
        excessMins = netWorkingMins - minPresentMins;
    } else if (netWorkingMins > halfDayMins && netWorkingMins < minPresentMins) {
        excessMins = netWorkingMins - halfDayMins;
    }
    return excessMins > minOvertimeMins ? excessMins : 0;
}

const DAY_STATUS = {
    PRESENT: 1, HALF_DAY: 2, ABSENT: 3, LEAVE: 4,
    WEEK_OFF: 5, HOLIDAY: 6, WOWO: 7, WOPH: 8,
};
const DAY_STATUS_LABEL = {
    0: "unknown", 1: "present", 2: "half_day", 3: "absent", 4: "leave",
    5: "week_off", 6: "holiday", 7: "WOWO", 8: "WOPH",
};

const APPROVED_STATUS = 2;

function isWeekOff(date, payroll) {
    if (!payroll?.week_off_days) return false;
    const offDays = String(payroll.week_off_days)
        .split(",").map(d => parseInt(d.trim(), 10)).filter(d => Number.isFinite(d));
    const dayOfWeek = moment(date, "YYYY-MM-DD").day();
    return offDays.includes(dayOfWeek);
}

function resolveLeaveOverride(leave_list) {
    if (!Array.isArray(leave_list) || leave_list.length === 0) {
        return { isLeave: false, leave_info: [] };
    }
    const approvedLeaves = leave_list.filter(l => l.leave_status === APPROVED_STATUS);
    const leave_info = leave_list.map(l => ({
        leave_type_id: l.leave_type_id, leave_status: l.leave_status, hourly_leave_duration: l.hourly_leave_duration,
    }));
    return { isLeave: approvedLeaves.length > 0, leave_info };
}

function buildWorkOnOffDayResult(statusCode, payroll, total_working_hour, leave_info) {
    const rawWorkingMins = timeStrToMinutes(total_working_hour);
    const breakMins = timeStrToMinutes(payroll?.daily_break_hours);
    const netWorkingMins = Math.max(0, rawWorkingMins - breakMins);
    return {
        day_status: statusCode, late_in: null, early_out: null,
        net_working_hour: minutesToTimeStr(netWorkingMins),
        overtime_hours: minutesToTimeStr(netWorkingMins),
        leave_info,
    };
}

function calcDayStatus(date, first_in, last_out, total_working_hour, payroll, compensation_list, leave_list = [], holiday_list = []) {
    const { isLeave, leave_info } = resolveLeaveOverride(leave_list);
    const isHolidayDay = Array.isArray(holiday_list) && holiday_list.length > 0;
    const isWeekOffDay = isWeekOff(date, payroll);

    const rawWorkingMins = timeStrToMinutes(total_working_hour);
    const hasAnyWork = rawWorkingMins > 0;

    if (isWeekOffDay) {
        if (hasAnyWork) return buildWorkOnOffDayResult(DAY_STATUS.WOWO, payroll, total_working_hour, leave_info);
        return { day_status: DAY_STATUS.WEEK_OFF, late_in: null, early_out: null, net_working_hour: "00:00:00", overtime_hours: "00:00:00", leave_info };
    }
    if (isHolidayDay) {
        if (hasAnyWork) return buildWorkOnOffDayResult(DAY_STATUS.WOPH, payroll, total_working_hour, leave_info);
        return { day_status: DAY_STATUS.HOLIDAY, late_in: null, early_out: null, net_working_hour: "00:00:00", overtime_hours: "00:00:00", leave_info };
    }
    if (!payroll) {
        return { day_status: isLeave ? DAY_STATUS.LEAVE : 0, late_in: null, early_out: null, net_working_hour: "00:00:00", overtime_hours: "00:00:00", leave_info };
    }

    const firstInStr = first_in ? moment(first_in).format("YYYY-MM-DD HH:mm:ss") : null;
    const lastOutStr = last_out ? moment(last_out).format("YYYY-MM-DD HH:mm:ss") : null;

    const gracePeriodMins = parseInt(payroll.grace_period ?? 0, 10);
    const breakMins = timeStrToMinutes(payroll.daily_break_hours);
    const minPresentMins = timeStrToMinutes(payroll.min_present_hours);
    const halfDayMins = timeStrToMinutes(payroll.half_day_hours);
    const minOvertimeMins = timeStrToMinutes(payroll.min_overtime_hours);

    const afterBreakMins = Math.max(0, rawWorkingMins - breakMins);
    const compensationMins = calcCompensationMinutes(compensation_list);
    const netWorkingMins = Math.max(0, afterBreakMins + compensationMins);
    const netWorkingHourStr = minutesToTimeStr(netWorkingMins);

    let day_status;
    if (isLeave) day_status = DAY_STATUS.LEAVE;
    else if (netWorkingMins >= minPresentMins) day_status = DAY_STATUS.PRESENT;
    else if (netWorkingMins >= halfDayMins) day_status = DAY_STATUS.HALF_DAY;
    else day_status = DAY_STATUS.ABSENT;

    const overtimeMins = calcOvertimeMinutes(netWorkingMins, minPresentMins, halfDayMins, minOvertimeMins);
    const overtimeHourStr = minutesToTimeStr(overtimeMins);

    let regularOvertimeHourStr = "00:00:00";
    let extraOvertimeHourStr = "00:00:00";
    if (day_status === DAY_STATUS.HALF_DAY) {
        regularOvertimeHourStr = overtimeHourStr;
    } else {
        extraOvertimeHourStr = overtimeHourStr;
    }

    let late_in = null;
    if (firstInStr) {
        const datePrefix = firstInStr.slice(0, 10);
        const scheduledIn = moment(`${datePrefix} ${payroll.daily_in_time}`, "YYYY-MM-DD HH:mm:ss");
        const graceIn = scheduledIn.clone().add(gracePeriodMins, "minutes");
        const actualIn = moment(firstInStr, "YYYY-MM-DD HH:mm:ss");
        if (actualIn.isAfter(graceIn)) late_in = minutesToTimeStr(actualIn.diff(scheduledIn, "minutes"));
    }
    let early_out = null;
    if (lastOutStr) {
        const datePrefix = lastOutStr.slice(0, 10);
        const scheduledOut = moment(`${datePrefix} ${payroll.daily_out_time}`, "YYYY-MM-DD HH:mm:ss");
        const graceOut = scheduledOut.clone().subtract(gracePeriodMins, "minutes");
        const actualOut = moment(lastOutStr, "YYYY-MM-DD HH:mm:ss");
        if (actualOut.isBefore(graceOut)) early_out = minutesToTimeStr(scheduledOut.diff(actualOut, "minutes"));
    }

    return {
        day_status,
        late_in,
        early_out,
        net_working_hour: netWorkingHourStr,
        overtime_hours: overtimeHourStr,
        regular_overtime_hours: regularOvertimeHourStr,
        extra_overtime_hours: extraOvertimeHourStr,
        leave_info
    };
}

// ============================================================
// SALARY ENGINE
// ============================================================

const SALARY_TYPE = { HOUR_WISE: 1, DAY_WISE: 2, MONTH_WISE: 3 };

const PF_MINIMUM_BASIC_SALARY = 15000;
const PF_FIX_VALUE = 1800;
const ESI_GROSS_SALARY_LIMIT = 21001;
const PT_DEDUCTION_SALARY_MINIMUM_AMOUNT = 12000;
const PT_AMOUNT = 200;

function resolveCalculateDays(year, month, payroll) {
    const calcMonthCount = parseInt(payroll.salary_cal_month_count, 10);
    const daysInMonth = moment(`${year}-${month}`, "YYYY-MM").daysInMonth();

    if (calcMonthCount === 1) return 30;
    if (calcMonthCount === 2) return daysInMonth;
    if (calcMonthCount === 3) {
        const offDays = String(payroll.week_off_days ?? "")
            .split(",").map(d => parseInt(d.trim(), 10)).filter(d => Number.isFinite(d));
        if (offDays.length === 0) return daysInMonth;
        let weekOffCount = 0;
        const startOfMonth = moment(`${year}-${month}-01`, "YYYY-MM-DD");
        for (let i = 0; i < daysInMonth; i++) {
            const dow = startOfMonth.clone().add(i, "days").day();
            if (offDays.includes(dow)) weekOffCount++;
        }
        return daysInMonth - weekOffCount;
    }
    return daysInMonth;
}

function aggregateMonthAttendance(batchRows) {
    const buckets = {
        totalPresentDay: 0, halfDay: 0, holiday: 0, totalWeekOff: 0,
        totalLeave: 0, totalAbsent: 0, totalOvertimeMins: 0, regularOtMins: 0, extraOtMins: 0, netWorkingMins: 0,
        compensationCredit: 0, compensationDebit: 0,
    };

    for (const row of batchRows) {
        switch (row.day_status) {
            case DAY_STATUS.PRESENT: buckets.totalPresentDay += 1; break;
            case DAY_STATUS.HALF_DAY: buckets.halfDay += 1; break;
            case DAY_STATUS.HOLIDAY:
            case DAY_STATUS.WOPH: buckets.holiday += 1; break;
            case DAY_STATUS.WEEK_OFF:
            case DAY_STATUS.WOWO: buckets.totalWeekOff += 1; break;
            case DAY_STATUS.LEAVE: buckets.totalLeave += 1; break;
            case DAY_STATUS.ABSENT: buckets.totalAbsent += 1; break;
        }
        const regMins = timeStrToMinutes(row.regular_overtime_hour || (row.day_status === DAY_STATUS.HALF_DAY ? row.overtime_hour : "00:00:00"));
        const extMins = timeStrToMinutes(row.extra_overtime_hour || (row.day_status !== DAY_STATUS.HALF_DAY ? row.overtime_hour : "00:00:00"));
        buckets.regularOtMins += regMins;
        buckets.extraOtMins += extMins;
        buckets.totalOvertimeMins += (regMins + extMins);
        buckets.netWorkingMins += timeStrToMinutes(row.net_working_hour);

        let compList = row.compensation_list;
        if (typeof compList === "string") { try { compList = JSON.parse(compList); } catch { compList = []; } }
        if (Array.isArray(compList)) {
            for (const item of compList) {
                const hrs = num(item.hours);
                if (item.adjustment_type === 1) buckets.compensationCredit += hrs;
                else if (item.adjustment_type === 2) buckets.compensationDebit += hrs;
            }
        }
    }
    return buckets;
}

function calcTotalDay({ totalPresentDay, holiday, totalWeekOff, halfDay }) {
    return totalPresentDay + holiday + totalWeekOff + halfDay;
}

function calcCtc(payroll, salaryType) {
    if (salaryType === SALARY_TYPE.MONTH_WISE) return num(payroll.ctc);
    return num(payroll.salary_amount_type_wise);
}

function calcGrossSalary(payroll) {
    return num(payroll.basic_da) + num(payroll.hra) + num(payroll.conveyance_allowance)
        + num(payroll.medical_allowance) + num(payroll.special_allowance);
}

function calcFixedSalary(payroll, calculateDays) {
    const ratio = calculateDays / 30;
    const fxs_basic = num(payroll.basic_da) * ratio;
    const fxs_hra = num(payroll.hra) * ratio;
    const fxs_other = (num(payroll.conveyance_allowance) + num(payroll.medical_allowance) + num(payroll.special_allowance)) * ratio;
    const fxs_total_earning = fxs_basic + fxs_hra + fxs_other;
    return { fxs_basic, fxs_hra, fxs_other, fxs_total_earning };
}

function calcDaysWorkedSalary(fxs, totalDay, calculateDays) {
    const ratio = calculateDays > 0 ? (totalDay / calculateDays) : 0;
    const dws_basic = fxs.fxs_basic * ratio;
    const dws_hra = fxs.fxs_hra * ratio;
    const dws_other = fxs.fxs_other * ratio;
    const dws_total_earning = dws_basic + dws_hra + dws_other;
    return { dws_basic, dws_hra, dws_other, dws_total_earning };
}

function calcPerDaySalary(fxsTotalEarning, calculateDays) {
    return calculateDays > 0 ? (fxsTotalEarning / calculateDays) : 0;
}

function calcOvertimePayable(payroll, regularOtMins, extraOtMins, dwsBasic, calculateDays) {
    const regularOtHours = regularOtMins / 60;
    const extraOtHours = extraOtMins / 60;
    const dailyWorkingHours = timeStrToMinutes(payroll.daily_working_hours) / 60;
    const denominator = calculateDays * dailyWorkingHours;
    const formulaRate = denominator > 0 ? (dwsBasic / denominator) : 0;
    const explicitRate = num(payroll.overtime_amount_per_hour);
    const regularOtType = parseInt(payroll.regular_ot_type ?? 1, 10);
    const extraOtType = parseInt(payroll.extra_ot_type ?? 2, 10);

    const regularRate = (regularOtType === 2 && explicitRate > 0) ? explicitRate : formulaRate;
    const extraRate = (extraOtType === 2 && explicitRate > 0) ? explicitRate : formulaRate;

    const regularOtPayableAmt = regularOtHours * regularRate;
    const extraOtPayableAmt = extraOtHours * extraRate;
    const earnOtPayableAmt = regularOtPayableAmt + extraOtPayableAmt;

    return { regularOtPayableAmt, extraOtPayableAmt, earnOtPayableAmt };
}

function calcBonusAmount(payroll, dwsBasic) {
    return dwsBasic * (num(payroll.bonus_percentage) / 100);
}

function calcEmployeePF(totalEarning, payroll) {
    if (totalEarning >= PF_MINIMUM_BASIC_SALARY) return PF_FIX_VALUE;
    return (totalEarning * num(payroll.pf_percentage)) / 100;
}
function calcPradhanMantriPF(totalEarning, payroll) {
    if (totalEarning >= PF_MINIMUM_BASIC_SALARY) return PF_FIX_VALUE;
    return (totalEarning * num(payroll.pm_pf_percentage)) / 100;
}
function calcEsiEmployee(dwsTotalEarning, payroll) {
    if (dwsTotalEarning < ESI_GROSS_SALARY_LIMIT) return (dwsTotalEarning * num(payroll.esi_employee_side_percentage)) / 100;
    return 0;
}
function calcEsiCompany(dwsTotalEarning, payroll) {
    if (dwsTotalEarning < ESI_GROSS_SALARY_LIMIT) return (dwsTotalEarning * num(payroll.esi_company_side)) / 100;
    return 0;
}
function calcPt(totalEarning, payroll) {
    if (totalEarning >= PT_DEDUCTION_SALARY_MINIMUM_AMOUNT) return PT_AMOUNT;
    return num(payroll.pt_amount);
}

function calculateEmployeeSalary(year, month, payroll, batchRows) {
    const calculateDays = resolveCalculateDays(year, month, payroll);
    const {
        totalPresentDay, halfDay, holiday, totalWeekOff, totalLeave, totalAbsent,
        totalOvertimeMins, regularOtMins, extraOtMins, netWorkingMins, compensationCredit, compensationDebit,
    } = aggregateMonthAttendance(batchRows);

    const totalDay = calcTotalDay({ totalPresentDay, holiday, totalWeekOff, halfDay });
    const salaryType = parseInt(payroll.salary_type, 10);
    const ctc = calcCtc(payroll, salaryType);
    const grossSalary = calcGrossSalary(payroll);
    const perDaySalary = calcPerDaySalary(grossSalary, calculateDays);

    const fxs = calcFixedSalary(payroll, calculateDays);
    const dws = calcDaysWorkedSalary(fxs, totalDay, calculateDays);

    const { regularOtPayableAmt, extraOtPayableAmt, earnOtPayableAmt } = calcOvertimePayable(payroll, regularOtMins, extraOtMins, dws.dws_basic, calculateDays);
    const bonusAmount = calcBonusAmount(payroll, dws.dws_basic);

    const earnHeadFirst = num(payroll.earning_first);
    const earnHeadSecond = num(payroll.earning_second);
    const earnHeadThird = num(payroll.earning_third);

    const earnSubTotal = earnOtPayableAmt + bonusAmount + earnHeadFirst + earnHeadSecond + earnHeadThird;
    const totalEarning = earnSubTotal + dws.dws_total_earning;

    const dedEmpPf = calcEmployeePF(totalEarning, payroll);
    const dedPradhanMantriPf = calcPradhanMantriPF(totalEarning, payroll);
    const dedEsiEmployee = calcEsiEmployee(dws.dws_total_earning, payroll);
    const dedEsiCompany = calcEsiCompany(dws.dws_total_earning, payroll);
    const dedPt = calcPt(totalEarning, payroll);
    const dedInsurance = num(payroll.insurance_amount);
    const dedFirst = num(payroll.deduction_first);
    const dedSecond = num(payroll.deduction_second);
    const dedThird = num(payroll.deduction_third);

    const totalDeduction = dedEmpPf + dedPradhanMantriPf + dedEsiEmployee + dedPt + dedInsurance + dedFirst + dedSecond + dedThird;
    const netBankPay = totalEarning - totalDeduction;

    return {
        calculate_days: calculateDays, total_present_day: totalPresentDay, half_day: halfDay,
        holiday, total_week_off: totalWeekOff, total_leave: totalLeave, total_absent: totalAbsent,
        total_day: totalDay, working_hour: +(netWorkingMins / 60).toFixed(2),
        compensation_amount: { credit: compensationCredit, debit: compensationDebit },
        ctc, gross_salary: grossSalary, per_day_salary: +perDaySalary.toFixed(2),
        conveyance_allowance: num(payroll.conveyance_allowance),
        medical_allowance: num(payroll.medical_allowance),
        special_allowance: num(payroll.special_allowance),
        fxs_basic: +fxs.fxs_basic.toFixed(2), fxs_hra: +fxs.fxs_hra.toFixed(2),
        fxs_other: +fxs.fxs_other.toFixed(2), fxs_total_earning: +fxs.fxs_total_earning.toFixed(2),
        dws_basic: +dws.dws_basic.toFixed(2), dws_hra: +dws.dws_hra.toFixed(2),
        dws_other: +dws.dws_other.toFixed(2), dws_total_earning: +dws.dws_total_earning.toFixed(2),
        earn_ot_hours: minutesToTimeStr(totalOvertimeMins), earn_ot_payable_amt: +earnOtPayableAmt.toFixed(2),
        earn_head_first: earnHeadFirst, earn_head_second: earnHeadSecond, earn_head_third: earnHeadThird,
        bonus_amount: +bonusAmount.toFixed(2), earn_sub_total: +earnSubTotal.toFixed(2),
        total_earning: +totalEarning.toFixed(2),
        ded_emp_pf: +dedEmpPf.toFixed(2), ded_pradhan_mantri_pf: +dedPradhanMantriPf.toFixed(2),
        ded_esi_employee: +dedEsiEmployee.toFixed(2), ded_esi_company: +dedEsiCompany.toFixed(2),
        ded_pt: +dedPt.toFixed(2), ded_insurance: dedInsurance,
        ded_first: dedFirst, ded_second: dedSecond, ded_third: dedThird,
        total_deduction: +totalDeduction.toFixed(2),
        net_bank_pay: +netBankPay.toFixed(2),
    };
}

// ============================================================
// RUN THE FULL PIPELINE
// ============================================================

function loadJSON(file) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8"));
}

const attendanceRows = loadJSON("attendance_test_data.json");
const compensationRows = loadJSON("compensation_test_data.json");
const leaveRows = loadJSON("leave_test_data.json");
const holidayRows = loadJSON("holiday_test_data.json");
const payrollRows = loadJSON("payroll_test_data.json");

const EMP_IDS = [2, 10, 11];
const YEAR = "2026";
const MONTH = "05";
const FROM_DATE = "2026-05-01";
const TO_DATE = "2026-05-31";
const dateRange = generateDateRange(FROM_DATE, TO_DATE);

// Group everything
const attByEmpDate = {};
for (const r of attendanceRows) {
    const empId = r.a_application_login_id;
    const date = r.check_in_out_date_time.slice(0, 10);
    attByEmpDate[empId] ??= {}; attByEmpDate[empId][date] ??= []; attByEmpDate[empId][date].push(r);
}
const compByEmpDate = {};
for (const r of compensationRows) {
    const empId = r.a_application_login_id;
    compByEmpDate[empId] ??= {}; compByEmpDate[empId][r.apply_date] ??= []; compByEmpDate[empId][r.apply_date].push(r);
}
const leaveByEmpDate = {};
for (const r of leaveRows) {
    const empId = r.a_application_login_id;
    leaveByEmpDate[empId] ??= {}; leaveByEmpDate[empId][r.leave_date] ??= []; leaveByEmpDate[empId][r.leave_date].push(r);
}
const holidayByEmpDate = {};
for (const r of holidayRows) {
    const empId = r.a_application_login_id;
    holidayByEmpDate[empId] ??= {}; holidayByEmpDate[empId][r.holiday_date] ??= []; holidayByEmpDate[empId][r.holiday_date].push(r);
}
const payrollByEmp = Object.fromEntries(payrollRows.map(p => [p.a_application_login_id, p]));

// ── STEP 1: Attendance engine -> build attendance_batch_process rows ──────
const batchRowsByEmp = {};
const dailyResults = [];

for (const empId of EMP_IDS) {
    const payroll = payrollByEmp[empId];
    batchRowsByEmp[empId] = [];

    for (const date of dateRange) {
        const records = attByEmpDate[empId]?.[date] ?? [];
        const compensation_list = compByEmpDate[empId]?.[date] ?? [];
        const leave_list = leaveByEmpDate[empId]?.[date] ?? [];
        const holiday_list = holidayByEmpDate[empId]?.[date] ?? [];

        const isWeekOffDay = isWeekOff(date, payroll);
        const isHolidayDay = holiday_list.length > 0;

        if (records.length <= 0 && leave_list.length <= 0 && !isWeekOffDay && !isHolidayDay) continue;

        const { first_in, last_out, total_working_hour } = processAttendance(records);
        const { day_status, late_in, early_out, net_working_hour, overtime_hours } = calcDayStatus(
            date, first_in, last_out, total_working_hour, payroll, compensation_list, leave_list, holiday_list
        );

        const batchRow = {
            employee_id: empId, date, day_status, late_in, early_out,
            total_working_time: total_working_hour, net_working_hour, overtime_hour: overtime_hours,
            compensation_list: JSON.stringify(compensation_list),
        };
        batchRowsByEmp[empId].push(batchRow);

        dailyResults.push({
            emp: empId, date, dow: moment(date).format("ddd"),
            raw: total_working_hour, net: net_working_hour,
            status: `${day_status}(${DAY_STATUS_LABEL[day_status]})`,
            late_in: late_in ?? "-", early_out: early_out ?? "-", ot: overtime_hours,
        });
    }
}

// ── Print daily attendance table ───────────────────────────────────────
console.log("\n=== DAILY ATTENDANCE RESULTS ===\n");
const dCols = ["emp", "date", "dow", "raw", "net", "status", "late_in", "early_out", "ot"];
const dWidths = {};
for (const c of dCols) dWidths[c] = Math.max(c.length, ...dailyResults.map(r => String(r[c]).length));
const printD = row => console.log(dCols.map(c => String(row[c]).padEnd(dWidths[c])).join(" | "));
printD(Object.fromEntries(dCols.map(c => [c, c])));
console.log(dCols.map(c => "-".repeat(dWidths[c])).join("-|-"));
for (const r of dailyResults) printD(r);
console.log(`\nTotal daily rows: ${dailyResults.length} (days with zero data on ordinary working days are correctly omitted)`);

// ── STEP 2: Salary engine -> run against the batch rows just built ────────
console.log("\n\n=== MONTHLY SALARY SUMMARY (May 2026) ===\n");

const salaryResults = [];
for (const empId of EMP_IDS) {
    const payroll = payrollByEmp[empId];
    const batchRows = batchRowsByEmp[empId];
    const result = calculateEmployeeSalary(YEAR, MONTH, payroll, batchRows);
    salaryResults.push({ emp: empId, ...result });
}

// Print a transposed view (easier to read with this many columns)
const salaryCols = Object.keys(salaryResults[0]).filter(c => c !== "emp" && c !== "compensation_amount");
const empHeaderWidth = 10;
console.log("Field".padEnd(24) + salaryResults.map(r => `Emp ${r.emp}`.padEnd(empHeaderWidth)).join(""));
console.log("-".repeat(24 + empHeaderWidth * salaryResults.length));
for (const col of salaryCols) {
    const label = col.padEnd(24);
    const values = salaryResults.map(r => String(r[col]).padEnd(empHeaderWidth)).join("");
    console.log(label + values);
}
console.log("\ncompensation_amount:");
for (const r of salaryResults) {
    console.log(`  Emp ${r.emp}: ${JSON.stringify(r.compensation_amount)}`);
}

console.log("\n=== Pipeline complete ===");