import moment from "moment";
import { Op, Sequelize } from "sequelize";
import { acquireProcessLock, releaseProcessLock } from "../../helpers/processLockHelper.js";
import { employeeAccountTransactionsModel } from "../../models/activities/employeeAccountTransactionModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import { employeePayrollModel } from "../../models/hr/employeePayrollModel.js";
import { AttendanceBatchProcess } from "../../models/hr/processAttendanceModel.js";
import { salaryRegisterModel } from "../../models/hr/salaryRegisterModel.js";
import { PROCESS_TYPE } from "../../utils/AppEnumeration.js";
import { numberToWordsCurrency } from "../../utils/numberToWordsCurrency.js";
import { resBadRequest, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

// ── Constants ────────────────────────────────────────────────────────────

const DAY_STATUS = {
    PRESENT: 1, HALF_DAY: 2, ABSENT: 3, LEAVE: 4,
    WEEK_OFF: 5, HOLIDAY: 6, WOWO: 7, WOPH: 8,
};

const SALARY_TYPE = { HOUR_WISE: 1, DAY_WISE: 2, MONTH_WISE: 3 };

const PF_MINIMUM_BASIC_SALARY = 15000;
const PF_FIX_VALUE = 1800;
const ESI_GROSS_SALARY_LIMIT = 21001;
const PT_DEDUCTION_SALARY_MINIMUM_AMOUNT = 12000;
const PT_AMOUNT = 200;

// ── Helpers ──────────────────────────────────────────────────────────────

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

// ── calculate_days resolver (unchanged from before) ─────────────────────

function resolveCalculateDays(year, month, payroll) {
    const calcMonthCount = parseInt(payroll.salary_cal_month_count, 10);
    const daysInMonth = moment(`${year}-${month}`, "YYYY-MM").daysInMonth();

    if (calcMonthCount === 1) return 30;
    if (calcMonthCount === 2) return daysInMonth;

    if (calcMonthCount === 3) {
        const offDays = String(payroll.week_off_days ?? "")
            .split(",")
            .map(d => parseInt(d.trim(), 10))
            .filter(d => Number.isFinite(d));

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

// ── Attendance aggregation ───────────────────────────────────────────────

/**
 * Aggregates a month's attendance_batch_process rows into every day-status
 * bucket, working hours, and compensation credit/debit totals.
 */
function aggregateMonthAttendance(batchRows) {
    const buckets = {
        totalPresentDay: 0,   // P only (whole days)
        halfDay: 0,            // HD count (in days, e.g. 2 half-days = 2, not 1)
        holiday: 0,             // PH count
        totalWeekOff: 0,        // WO count
        totalLeave: 0,           // L count
        totalPaidLeave: 0,       // Company Pay leave count (paid_by = 1)
        totalUnpaidLeave: 0,     // Employee Pay leave count (paid_by = 2)
        totalAbsent: 0,           // A count
        totalOvertimeMins: 0,
        netWorkingMins: 0,        // SUM of net_working_hour -> "working_hour"
        compensationCredit: 0,
        compensationDebit: 0,
    };

    for (const row of batchRows) {
        switch (row.day_status) {
            case DAY_STATUS.PRESENT:
                buckets.totalPresentDay += 1;
                break;
            case DAY_STATUS.HALF_DAY:
                buckets.halfDay += 1;
                break;
            case DAY_STATUS.HOLIDAY:
            case DAY_STATUS.WOPH: // worked-on-holiday day still counts as a holiday day
                buckets.holiday += 1;
                break;
            case DAY_STATUS.WEEK_OFF:
            case DAY_STATUS.WOWO: // worked-on-week-off day still counts as a week-off day
                buckets.totalWeekOff += 1;
                break;
            case DAY_STATUS.LEAVE: {
                buckets.totalLeave += 1;
                let leaveList = row.leave_entry_list ?? row.leave_list;
                if (typeof leaveList === "string") {
                    try { leaveList = JSON.parse(leaveList); } catch { leaveList = []; }
                }
                const isCompanyPaid = Array.isArray(leaveList) && leaveList.some(l => Number(l.paid_by) === 1);
                if (isCompanyPaid) {
                    buckets.totalPaidLeave += 1;
                } else {
                    buckets.totalUnpaidLeave += 1;
                }
                break;
            }
            case DAY_STATUS.ABSENT:
                buckets.totalAbsent += 1;
                break;
        }

        buckets.totalOvertimeMins += timeStrToMinutes(row.overtime_hour);
        buckets.netWorkingMins += timeStrToMinutes(row.net_working_hour);

        // compensation_list is JSON-stringified array of {adjustment_type, hours}
        let compList = row.compensation_list;
        if (typeof compList === "string") {
            try { compList = JSON.parse(compList); } catch { compList = []; }
        }
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

// ── Core salary formula functions ────────────────────────────────────────

/**
 * Calculates payable days (total_day) based on salary_cal_month_count setting.
 * - Half Day (HD) counts as 0.5 day.
 * - Company Pay Leaves (paid_by = 1) count as paid days (+1.0 day).
 * - Mode 3 (Per Month Total Day - Week Off): Excludes week-offs from payable days since calculate_days already deducts week offs.
 */
function calcTotalDay({ totalPresentDay, holiday, totalWeekOff, halfDay, totalPaidLeave }, calcMonthCount) {
    const halfDayCredit = halfDay * 0.5;
    const paidLeaveCredit = totalPaidLeave || 0;
    if (calcMonthCount === 3) {
        return totalPresentDay + holiday + paidLeaveCredit + halfDayCredit;
    }
    return totalPresentDay + holiday + totalWeekOff + paidLeaveCredit + halfDayCredit;
}

function calcCtc(payroll, salaryType) {
    if (salaryType === SALARY_TYPE.MONTH_WISE) {
        return num(payroll.ctc);
    }
    return num(payroll.salary_amount_type_wise);
}

function calcGrossSalary(payroll) {
    return num(payroll.basic_da)
        + num(payroll.hra)
        + num(payroll.conveyance_allowance)
        + num(payroll.medical_allowance)
        + num(payroll.special_allowance);
}

/**
 * fxs_* -- fixed monthly base salary components (NOT attendance-dependent)
 */
function calcFixedSalary(payroll) {
    const fxs_basic = num(payroll.basic_da);
    const fxs_hra = num(payroll.hra);
    const fxs_other = num(payroll.conveyance_allowance) + num(payroll.medical_allowance) + num(payroll.special_allowance);
    const fxs_total_earning = fxs_basic + fxs_hra + fxs_other;

    return { fxs_basic, fxs_hra, fxs_other, fxs_total_earning };
}

/**
 * dws_* -- attendance pro-rated: fxs_X * (total_day / calculate_days)
 */
function calcDaysWorkedSalary(fxs, totalDay, calculateDays) {
    const attendanceRatio = calculateDays > 0 ? (totalDay / calculateDays) : 0;

    const dws_basic = fxs.fxs_basic * attendanceRatio;
    const dws_hra = fxs.fxs_hra * attendanceRatio;
    const dws_other = fxs.fxs_other * attendanceRatio;
    const dws_total_earning = dws_basic + dws_hra + dws_other;

    return { dws_basic, dws_hra, dws_other, dws_total_earning };
}

/**
 * per_day_salary -- view-only helper: fxs_total_earning / calculate_days
 */
function calcPerDaySalary(fxsTotalEarning, calculateDays) {
    return calculateDays > 0 ? (fxsTotalEarning / calculateDays) : 0;
}

/**
 * Overtime payable amount.
 *   - If payroll.overtime_amount_per_hour is set: rate = that value (flat per-hour).
 *   - Else: rate = dws_basic / (calculate_days * daily_working_hours_per_day)
 */
function calcOvertimePayable(payroll, totalOvertimeMins, basicDa, calculateDays) {
    const overtimeHours = totalOvertimeMins / 60;
    const explicitRate = num(payroll.overtime_amount_per_hour);

    let rate;
    if (explicitRate > 0) {
        rate = explicitRate;
    } else {
        const dailyWorkingHours = timeStrToMinutes(payroll.daily_working_hours) / 60;
        const denominator = calculateDays * dailyWorkingHours;
        rate = denominator > 0 ? (basicDa / denominator) : 0;
    }

    return overtimeHours * rate;
}

function calcBonusAmount(payroll, dwsBasic) {
    const bonusPercentage = num(payroll.bonus_percentage);
    return dwsBasic * (bonusPercentage / 100);
}

// ── Statutory deduction slabs ─────────────────────────────────────────────

function calcEmployeePF(totalEarning, payroll) {
    if (payroll.pf_percentage <= 0) {
        return 0
    }
    if (totalEarning >= PF_MINIMUM_BASIC_SALARY) {
        return PF_FIX_VALUE;
    }
    return (totalEarning * num(payroll.pf_percentage)) / 100;
}

function calcPradhanMantriPF(totalEarning, payroll) {
    if (payroll.pm_pf_percentage <= 0) {
        return 0
    }
    if (totalEarning >= PF_MINIMUM_BASIC_SALARY) {
        return PF_FIX_VALUE;
    }
    return (totalEarning * num(payroll.pm_pf_percentage)) / 100;
}

function calcEsiEmployee(dwsTotalEarning, payroll) {
    if (payroll.esi_employee_side_percentage <= 0) {
        return 0
    }
    if (dwsTotalEarning < ESI_GROSS_SALARY_LIMIT) {
        return (dwsTotalEarning * num(payroll.esi_employee_side_percentage)) / 100;
    }
    return 0;
}

function calcEsiCompany(dwsTotalEarning, payroll) {
    if (payroll.esi_company_side <= 0) {
        return 0
    }
    if (dwsTotalEarning < ESI_GROSS_SALARY_LIMIT) {
        return (dwsTotalEarning * num(payroll.esi_company_side)) / 100;
    }
    return 0;
}

function calcPt(totalEarning, payroll) {
    if (payroll.pt_amount <= 0) {
        return 0
    }
    if (totalEarning >= PT_DEDUCTION_SALARY_MINIMUM_AMOUNT) {
        return PT_AMOUNT;
    }
    return num(payroll.pt_amount);
}

// ── Main per-employee calculation ────────────────────────────────────────

function calculateEmployeeSalary(year, month, payroll, batchRows) {
    const calculateDays = resolveCalculateDays(year, month, payroll);

    const {
        totalPresentDay, halfDay, holiday, totalWeekOff, totalLeave, totalPaidLeave, totalUnpaidLeave, totalAbsent,
        totalOvertimeMins, netWorkingMins, compensationCredit, compensationDebit,
    } = aggregateMonthAttendance(batchRows);

    const calcMonthCount = parseInt(payroll.salary_cal_month_count, 10);
    const totalDay = calcTotalDay({ totalPresentDay, holiday, totalWeekOff, halfDay, totalPaidLeave }, calcMonthCount);

    const salaryType = parseInt(payroll.salary_type, 10);
    const ctc = calcCtc(payroll, salaryType);
    const grossSalary = calcGrossSalary(payroll);
    const perDaySalary = calcPerDaySalary(grossSalary, calculateDays);

    const fxs = calcFixedSalary(payroll);
    const dws = calcDaysWorkedSalary(fxs, totalDay, calculateDays);

    const earnOtPayableAmt = calcOvertimePayable(payroll, totalOvertimeMins, num(payroll.basic_da), calculateDays);
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
        calculate_days: calculateDays,
        total_present_day: totalPresentDay,
        half_day: halfDay,
        holiday,
        total_week_off: totalWeekOff,
        total_leave: totalLeave,
        total_paid_leave: totalPaidLeave,
        total_unpaid_leave: totalUnpaidLeave,
        total_absent: totalAbsent,
        total_day: totalDay,
        working_hour: netWorkingMins / 60, // stored as decimal hours
        compensation_amount: JSON.stringify({ credit: compensationCredit, debit: compensationDebit }),

        basic_da: num(payroll.basic_da),
        hra: num(payroll.hra),
        ctc,
        gross_salary: grossSalary,
        per_day_salary: perDaySalary,

        conveyance_allowance: num(payroll.conveyance_allowance),
        medical_allowance: num(payroll.medical_allowance),
        special_allowance: num(payroll.special_allowance),

        fxs_basic: fxs.fxs_basic,
        fxs_hra: fxs.fxs_hra,
        fxs_other: fxs.fxs_other,
        fxs_total_earning: fxs.fxs_total_earning,

        dws_basic: dws.dws_basic,
        dws_hra: dws.dws_hra,
        dws_other: dws.dws_other,
        dws_total_earning: dws.dws_total_earning,

        earn_ot_hours: minutesToTimeStr(totalOvertimeMins),
        earn_ot_payable_amt: earnOtPayableAmt,
        earn_head_first: earnHeadFirst,
        earn_head_second: earnHeadSecond,
        earn_head_third: earnHeadThird,
        bonus_amount: bonusAmount,
        earn_sub_total: earnSubTotal,
        total_earning: totalEarning,

        ded_emp_pf: dedEmpPf,
        ded_pradhan_mantri_pf: dedPradhanMantriPf,
        ded_esi_employee: dedEsiEmployee,
        ded_esi_company: dedEsiCompany,
        ded_pt: dedPt,
        ded_insurance: dedInsurance,
        ded_first: dedFirst,
        ded_second: dedSecond,
        ded_third: dedThird,
        total_deduction: totalDeduction,

        net_bank_pay: netBankPay,
    };
}

// ── Main orchestrator ────────────────────────────────────────────────────

export const salaryCalculate = async (req) => {
    const { a_application_login_id, year, month } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const lockAcquired = await acquireProcessLock(
        findCompanyId.company_masters_id,
        PROCESS_TYPE.SALARY,
        a_application_login_id
    );

    if (!lockAcquired) {
        return resBadRequest({
            ack: 0,
            ack_msg: "Attendance process is already running for this company. Please try again later.",
            developer_msg: "Attendance process is already running for this company. Please try again later.",
        });
    }
    try {
        const employeePayrollModelInstance = employeePayrollModel(req.tenantDB);
        const AttendanceBatchProcessInstance = AttendanceBatchProcess(req.tenantDB);
        const salaryRegisterModelInstance = salaryRegisterModel(req.tenantDB);

        // ── 1. Fetch active employees ────────────────────────────────────
        const activeTeamList = await loginModel.findAll({
            where: {
                id: {
                    [Op.in]: Sequelize.literal(`(
                        SELECT a_application_login_id
                        FROM company_vs_application_logins
                        WHERE isDelete=0 AND company_masters_id = '${findCompanyId.company_masters_id}'
                    )`)
                },
                isDelete: 0
            },
            attributes: ["username", "recovery_mobile", "employee_id", "id"],
            raw: true
        });

        const employeeIds = activeTeamList.map(e => e.id);

        const monthStart = moment(`${year}-${month}-01`, "YYYY-MM-DD").format("YYYY-MM-DD");
        const monthEnd = moment(monthStart, "YYYY-MM-DD").endOf("month").format("YYYY-MM-DD");

        // ── 2. Batch fetch payroll + the whole month's attendance rows ─────
        const [employeePayrollDetail, monthAttendance] = await Promise.all([
            employeePayrollModelInstance.findAll({
                where: { isDelete: 0, a_application_login_id: { [Op.in]: employeeIds } },
                raw: true
            }),
            AttendanceBatchProcessInstance.findAll({
                where: {
                    isDelete: 0,
                    employee_id: { [Op.in]: employeeIds },
                    date: { [Op.between]: [monthStart, monthEnd] }
                },
                raw: true
            })
        ]);

        const employeePayrollMap = new Map(employeePayrollDetail.map(e => [e.a_application_login_id, e]));

        // ── 3. Group attendance rows by employee ───────────────────────────
        const attendanceByEmp = {};
        for (const row of monthAttendance) {
            attendanceByEmp[row.employee_id] ??= [];
            attendanceByEmp[row.employee_id].push(row);
        }

        // ── 4. Build salary rows (pure CPU, no awaits) ──────────────────────
        const CurrentDate = moment().format("YYYY-MM-DD");
        const upsertValues = [];

        for (const empId of employeeIds) {
            const payroll = employeePayrollMap.get(empId);
            if (!payroll) continue;

            const batchRows = attendanceByEmp[empId] ?? [];
            const calculated = calculateEmployeeSalary(year, month, payroll, batchRows);

            upsertValues.push({
                year: String(year),
                month: String(month),
                added_date: CurrentDate,
                employee_id: empId,
                company_masters_id: findCompanyId.company_masters_id,
                a_application_login_id: a_application_login_id,
                ...calculated,
            });
        }

        // ── 5. Upsert into salary_registers ─────────────────────────────────
        const updateOnDuplicate = Object.keys(
            salaryRegisterModelInstance.rawAttributes
        ).filter(key => !['id', 'employee_id', 'year', 'month', 'isDelete', 'created_date_time'].includes(key));

        await salaryRegisterModelInstance.bulkCreate(upsertValues, { updateOnDuplicate });

        return resSuccess({ ack_msg: "salary calculation success" });

    } catch (error) {
        console.error("salaryCalculate:", error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    } finally {
        await releaseProcessLock(findCompanyId.company_masters_id, PROCESS_TYPE.SALARY);
    }
};

export const salaryFetch = async (req) => {
    try {
        const { a_application_login_id, ll, ul } = req.body;
        const salaryRegisterModelInstance = salaryRegisterModel(req.tenantDB);

        let offset = Number(ul);
        let limit = Number(ll);
        const results = await salaryRegisterModelInstance.findAll({
            attributes: [
                "id",
                'year',
                'month',
                [
                    Sequelize.fn('MAX', Sequelize.col('modified_date')),
                    'last_modified_date'
                ]
            ],
            where: {
                isDelete: 0
            },
            group: [
                'year',
                'month'
            ],
            order: [
                ['year', 'DESC'],
                ['month', 'DESC']
            ],
            limit,
            offset,
            raw: true
        });

        return resSuccess({ data: results });
    } catch (error) {
        console.error("salaryFetch:", error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    }
};


/**
 * salary8Hour: per-hour rate derived from attendance-adjusted basic pay
 * divided by the employee's configured daily working hours.
 *   salary8Hour = dws_basic / payroll.daily_working_hours (in hours)
 *
 * NOTE: this is the interpretation that can actually produce values in the
 * 60-75 range seen in your sample. If salary8Hour was meant to come from
 * payroll.daily_working_hours directly (e.g. "09:00" -> 9), that field alone
 * cannot reach 68.75, so I've implemented the per-hour-rate version instead.
 * Flag this if it's still not matching your real numbers.
 */
function calcSalary8Hour(dwsBasic, payroll) {
    const dailyHours = timeStrToMinutes(payroll.daily_working_hours) / 60;
    return dailyHours > 0 ? (dwsBasic / dailyHours) : 0;
}

export const getSalaryDetail = async (req) => {
    try {
        const { employeeIds, month, year } = req.body;

        const employeeIdsArr = employeeIds ? employeeIds.split(",") : [];
        // employeeIds: array of ints, e.g. [101, 102]
        // month: "5" or 5 ; year: "2026" or 2026

        const salaryRegisterModelInstance = salaryRegisterModel(req.tenantDB);
        const employeePayrollModelInstance = employeePayrollModel(req.tenantDB);

        const [salaryRows, payrollRows] = await Promise.all([
            salaryRegisterModelInstance.findAll({
                where: {
                    isDelete: 0,
                    employee_id: { [Op.in]: employeeIdsArr },
                    year: String(year),
                    month: month,
                },
                raw: true,
            }),
            employeePayrollModelInstance.findAll({
                where: { isDelete: 0, a_application_login_id: { [Op.in]: employeeIdsArr } },
                raw: true,
            }),
        ]);

        const payrollByEmp = new Map(payrollRows.map(p => [p.a_application_login_id, p]));
        const salaryByEmp = new Map(salaryRows.map(s => [s.employee_id, s]));

        const salary = {};

        for (const empId of employeeIdsArr) {
            const row = salaryByEmp.get(Number(empId));
            const payroll = payrollByEmp.get(Number(empId));
            if (!row || !payroll) continue; // no salary calculated / no payroll config for this employee yet

            const dwsBasic = num(row.dws_basic);
            const dwsHra = num(row.dws_hra);
            const medicalAllowance = num(row.medical_allowance);
            const conveyanceAllowance = num(row.conveyance_allowance);
            const specialAllowance = num(row.special_allowance);
            const earnOtPayableAmt = num(row.earn_ot_payable_amt);
            const earnHeadFirst = num(row.earn_head_first);
            const earnHeadSecond = num(row.earn_head_second);
            const earnHeadThird = num(row.earn_head_third);

            const others_earning = earnHeadFirst + earnHeadSecond + earnHeadThird;
            const gross = dwsBasic + dwsHra + medicalAllowance + conveyanceAllowance + specialAllowance + earnOtPayableAmt + earnHeadFirst + earnHeadSecond + earnHeadThird;

            const dedEmpPf = num(row.ded_emp_pf);
            const dedPt = num(row.ded_pt);
            const dedPradhanMantriPf = num(row.ded_pradhan_mantri_pf);
            const dedEsiEmployee = num(row.ded_esi_employee);
            const dedInsurance = num(row.ded_insurance);
            const dedFirst = num(row.ded_first);
            const dedSecond = num(row.ded_second);
            const dedThird = num(row.ded_third);
            const othersDeduction = dedFirst + dedSecond + dedThird

            const totalDeduction = dedEmpPf + dedPt + dedPradhanMantriPf + dedEsiEmployee + dedInsurance + dedFirst + dedSecond + dedThird + othersDeduction

            const salaryToBePaid = Math.round(num(row.net_bank_pay));

            salary[empId] = {
                leave: num(row.total_unpaid_leave),
                paid_leave: num(row.total_paid_leave),
                unpaid_leave: num(row.total_unpaid_leave),
                total_working_days: num(row.calculate_days),
                payable_days: num(row.total_day),
                basicda: +dwsBasic.toFixed(2),
                hra: +dwsHra.toFixed(2),
                medi_all: +medicalAllowance.toFixed(2),
                conv_all: +conveyanceAllowance.toFixed(2),
                spe_all: +specialAllowance.toFixed(2),
                overtime: +earnOtPayableAmt.toFixed(2),
                others_earning: +others_earning.toFixed(2),
                gross: +gross.toFixed(2),
                pf: +dedEmpPf.toFixed(2),
                pt: +dedPt.toFixed(2),
                pm_pf: +dedPradhanMantriPf.toFixed(2),
                esi: +dedEsiEmployee.toFixed(2),
                insurance: +dedInsurance.toFixed(2),
                others_deduction: +othersDeduction.toFixed(2),
                remark: `Salary ${month}-${year}`,
                total_deduction: +totalDeduction.toFixed(2),
                net_payable: +salaryToBePaid,
                net_payable_in_word: numberToWordsCurrency(salaryToBePaid, 'INR')
            };
        }

        return resSuccess({ data: { salary } });

    } catch (error) {
        console.error("getSalaryDetail:", error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    }
};

const MONTHS_LIST = {
    1: "January", 2: "February", 3: "March", 4: "April",
    5: "May", 6: "June", 7: "July", 8: "August",
    9: "September", 10: "October", 11: "November", 12: "December",
};

export const proceedToAccount = async (req) => {
    const { a_application_login_id, year, month } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    const lockAcquired = await acquireProcessLock(
        findCompanyId.company_masters_id,
        PROCESS_TYPE.SALARY,
        a_application_login_id
    );

    if (!lockAcquired) {
        return resBadRequest({
            ack: 0,
            ack_msg: "Salary process is already running for this company. Please try again later.",
            developer_msg: "Salary process is already running for this company. Please try again later.",
        });
    }

    try {
        const salaryRegisterModelInstance = salaryRegisterModel(req.tenantDB);
        const employeeAccountTransactionsModelInstance = employeeAccountTransactionsModel(req.tenantDB);

        // ── 1. Fetch salary rows ───────────────────────────────────────────
        const fetchSalary = await salaryRegisterModelInstance.findAll({
            where: { isDelete: 0, month, year },
            attributes: ["id", "employee_id", "net_bank_pay"],
            raw: true,
        });

        if (fetchSalary.length === 0) {
            return resError({ ack_msg: "Salary detail not found." });
        }

        const remark = `Salary ${MONTHS_LIST[Number(month)]}-${year}`;
        const paymentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

        // ── 2. Delete existing transactions + bulk insert in one sequential
        //       operation (destroy first, then create, inside the same try
        //       block so the finally lock-release still runs on any failure) ─
        await employeeAccountTransactionsModelInstance.destroy({
            where: {
                reference_table: "salary_registers",
                salary_month: month,
                salary_year: year,
            },
        });

        const accountEntries = fetchSalary.map(v => ({
            team_id: v.employee_id,
            a_application_login_id: a_application_login_id,
            company_masters_id: findCompanyId.company_masters_id,
            type: 1,
            mode: -1,
            amount: +Number(v.net_bank_pay).toFixed(2),
            payment_date_time: paymentDateTime,
            reference_id: v.id,
            reference_table: "salary_registers",
            salary_month: month,
            salary_year: year,
            remark,
        }));

        await employeeAccountTransactionsModelInstance.bulkCreate(accountEntries);

        return resSuccess({ ack_msg: "Salary transferred to employee account successfully" });

    } catch (error) {
        console.error("proceedToAccount:", error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    } finally {
        await releaseProcessLock(findCompanyId.company_masters_id, PROCESS_TYPE.SALARY);
    }
};