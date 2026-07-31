import moment from "moment";
import { Op, Sequelize } from "sequelize";
import { acquireProcessLock, releaseProcessLock } from "../../helpers/processLockHelper.js";
import loginModel from "../../models/application_login/loginModel.js";
import { attendanceModel } from "../../models/hr/attendanceModel.js";
import { AttendanceRoundoffRules } from "../../models/hr/AttendanceRoundoffRulesModel.js";
import { compensationAdjustmentModel } from "../../models/hr/compensationAdjustmentModel.js";
import { employeePayrollModel } from "../../models/hr/employeePayrollModel.js";
import { holidayModel } from "../../models/hr/holidayModel.js";
import { leavesModel } from "../../models/hr/leavesModel.js";
import { AttendanceBatchProcess } from "../../models/hr/processAttendanceModel.js";
import { PROCESS_TYPE } from "../../utils/AppEnumeration.js";
import { generateDateRange, resBadRequest, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const misPunchList = async (req) => {
    const { a_application_login_id, from_date, to_date } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    try {
        const dateRange = generateDateRange(from_date, to_date);
        const attendanceModelInstance = attendanceModel(req.tenantDB);

        const activeTeamList = await loginModel.findAll({
            where: {
                id: {
                    [Op.in]: Sequelize.literal(`(
                        SELECT a_application_login_id
                        FROM company_vs_application_logins
                        WHERE isDelete = 0
                        AND company_masters_id = '${findCompanyId.company_masters_id}'
                    )`)
                },
                isDelete: 0
            },
            attributes: [
                "id",
                "username",
                "daily_in_time",
                "daily_out_time"
            ],
            raw: true
        });

        const employeeIds = activeTeamList.map(e => e.id);

        // SINGLE QUERY
        const attendanceData = await attendanceModelInstance.findAll({
            attributes: [
                [
                    Sequelize.fn(
                        "DATE",
                        Sequelize.col("check_in_out_date_time")
                    ),
                    "attendance_date"
                ],
                "a_application_login_id",
                [
                    Sequelize.literal(
                        "GROUP_CONCAT(attendance_status ORDER BY check_in_out_date_time ASC SEPARATOR '')"
                    ),
                    "type_string"
                ],
                [Sequelize.fn("COUNT", Sequelize.col("*")), "total_data"],
                [
                    Sequelize.literal("(COUNT(*) % 2)"),
                    "odd_or_even"
                ]
            ],
            where: {
                isDelete: 0,
                isActive: 1,
                a_application_login_id: {
                    [Op.in]: employeeIds
                },
                check_in_out_date_time: {
                    [Op.between]: [
                        `${from_date} 00:00:00`,
                        `${to_date} 23:59:59`
                    ]
                }
            },
            group: [
                Sequelize.fn(
                    "DATE",
                    Sequelize.col("check_in_out_date_time")
                ),
                "a_application_login_id"
            ],
            raw: true
        });

        // Fast lookup map
        const attendanceMap = new Map();

        for (const row of attendanceData) {
            attendanceMap.set(
                `${row.a_application_login_id}_${row.attendance_date}`,
                row
            );
        }

        const misPunch = [];

        for (const employee of activeTeamList) {
            for (const date of dateRange) {

                const attendance =
                    attendanceMap.get(`${employee.id}_${date}`);

                if (attendance) {
                    let punch_type = "";
                    let series = "";

                    for (let i = 0; i < attendance.total_data; i++) {
                        series += i % 2 === 0 ? "1" : "2";
                    }

                    if (
                        attendance.odd_or_even == 1 ||
                        series !== attendance.type_string
                    ) {
                        punch_type = "Mis Punch";
                    } else {
                        continue; // skip valid punches
                    }

                    misPunch.push({
                        employee_id: employee.id,
                        employee_name: employee.username,
                        username: employee.username,
                        date,
                        punch_type,
                        daily_in_time: employee.daily_in_time,
                        daily_out_time: employee.daily_out_time,
                        id: employee.id
                    });
                }
            }
        }

        return resSuccess({
            data: misPunch
        });

    } catch (error) {
        console.error("misPunchList:", error);

        return resBadRequest({
            ack: 0,
            developer_msg: error.message
        });
    }
};

export const initializing = async (req) => {

    const { a_application_login_id, from_date, to_date } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    const lockAcquired = await acquireProcessLock(
        findCompanyId.company_masters_id,
        PROCESS_TYPE.ATTENDANCE,
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
        const attendanceModelInstance = attendanceModel(req.tenantDB);
        const AttendanceBatchProcessInstance = AttendanceBatchProcess(req.tenantDB);

        // ── 1. Fetch active employees ──────────────────────────────────────
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

        if (!activeTeamList.length) {
            return resSuccess({ ack_msg: "initializing success - no active employees" });
        }

        const employeeIds = activeTeamList.map(e => e.id);
        const dateRange = generateDateRange(from_date, to_date);

        // ── 2. Single query: all attendance records for all employees × date range ──
        const attendanceRecords = await attendanceModelInstance.findAll({
            where: {
                isDelete: 0,
                a_application_login_id: { [Op.in]: employeeIds },
                [Op.and]: Sequelize.where(
                    Sequelize.fn('DATE', Sequelize.col('check_in_out_date_time')),
                    { [Op.between]: [from_date, to_date] }
                )
            },
            attributes: [
                'a_application_login_id',
                [Sequelize.fn('DATE', Sequelize.col('check_in_out_date_time')), 'attendance_date']
            ],
            group: ['a_application_login_id', 'attendance_date'],
            raw: true
        });

        // ── 3. Build O(1) lookup Set: "empId|date" ─────────────────────────
        const attendanceSet = new Set(
            attendanceRecords.map(r => `${r.a_application_login_id}|${r.attendance_date}`)
        );

        // ── 4. Build employee map for O(1) access ──────────────────────────
        const employeeMap = new Map(activeTeamList.map(e => [e.id, e]));

        // ── 5. Compute updateOnDuplicate once ──────────────────────────────
        const updateOnDuplicate = Object.keys(
            AttendanceBatchProcessInstance.rawAttributes
        ).filter(
            key => !['id', 'date', 'employee_id', 'isDelete', 'created_date_time'].includes(key)
        );

        const CurrentdateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

        // ── 6. Build upsert payload — pure in-memory, no awaits ────────────
        const upsertValues = [];

        for (const empId of employeeIds) {

            for (const date of dateRange) {
                if (!attendanceSet.has(`${empId}|${date}`)) continue;
                const employee = employeeMap.get(empId);

                upsertValues.push({
                    employee_id: empId,
                    search_string: `${employee.username}-${employee.recovery_mobile}${employee.employee_id ? "-" + employee.employee_id : ""}`,
                    company_masters_id: findCompanyId.company_masters_id,
                    a_application_login_id: a_application_login_id,
                    last_updated_date: CurrentdateTime,
                    date,
                    compensation_list: [],
                    attenance_entry_list: [],
                });
            }
        }

        if (upsertValues.length) {
            await AttendanceBatchProcessInstance.bulkCreate(upsertValues, { updateOnDuplicate });
        }

        return resSuccess({ ack_msg: "initializing success" });

    } catch (error) {
        console.error("initializing:", error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    } finally {
        await releaseProcessLock(findCompanyId.company_masters_id, PROCESS_TYPE.ATTENDANCE);
    }
};

export const compensationCalc = async (req) => {
    const { a_application_login_id, from_date, to_date } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const lockAcquired = await acquireProcessLock(
        findCompanyId.company_masters_id,
        PROCESS_TYPE.ATTENDANCE,
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
        const AttendanceBatchProcessInstance = AttendanceBatchProcess(req.tenantDB);
        const compensationAdjustmentModelInstance = compensationAdjustmentModel(req.tenantDB);
        const attendanceModelInstance = attendanceModel(req.tenantDB);

        // ── 1. Fetch all active employees ──────────────────────────────────
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

        // ── 2. Single query: all attendance records for all employees × date range ──
        const attendanceRecords = await attendanceModelInstance.findAll({
            where: {
                isDelete: 0,
                a_application_login_id: { [Op.in]: employeeIds },
                [Op.and]: Sequelize.where(
                    Sequelize.fn('DATE', Sequelize.col('check_in_out_date_time')),
                    { [Op.between]: [from_date, to_date] }
                )
            },
            attributes: [
                'a_application_login_id',
                [Sequelize.fn('DATE', Sequelize.col('check_in_out_date_time')), 'attendance_date']
            ],
            group: ['a_application_login_id', 'attendance_date'],
            raw: true
        });

        // ── 3. Build O(1) lookup Set: "empId|date" ─────────────────────────
        const attendanceSet = new Set(
            attendanceRecords.map(r => `${r.a_application_login_id}|${r.attendance_date}`)
        );

        const dateRange = generateDateRange(from_date, to_date);

        // ── 2. Single batch query for ALL employees × ALL dates ────────────
        const allCompensation = await compensationAdjustmentModelInstance.findAll({
            where: {
                isDelete: 0,
                employee_id: { [Op.in]: employeeIds },
                apply_date: { [Op.between]: [from_date, to_date] }
            },
            attributes: ['employee_id', 'apply_date', 'adjustment_type', 'amount', 'hours', 'type_id'],
            raw: true
        });

        // ── 3. Group by employeeId → date ──────────────────────────────────
        const grouped = {};
        for (const record of allCompensation) {
            const empId = record.employee_id;
            const date = record.apply_date; // already 'YYYY-MM-DD'

            if (!grouped[empId]) grouped[empId] = {};
            if (!grouped[empId][date]) grouped[empId][date] = [];

            grouped[empId][date].push({
                adjustment_type: record.adjustment_type,
                amount: record.amount,
                hours: record.hours,
                type_id: record.type_id,
            });
        }


        // ── 4. Build upsert payload (no awaits in loop) ────────────────────
        const upsertValues = [];
        const CurrentdateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

        for (const empId of employeeIds) {
            for (const date of dateRange) {
                const compensation_list = grouped[empId]?.[date] ?? [];
                if (compensation_list.length <= 0) continue;
                if (!attendanceSet.has(`${empId}|${date}`)) continue;
                upsertValues.push({
                    employee_id: empId,
                    company_masters_id: findCompanyId.company_masters_id,
                    a_application_login_id: a_application_login_id,
                    last_updated_date: CurrentdateTime,
                    date,
                    compensation_list: compensation_list,
                });
            }
        }

        // ── 5. updateOnDuplicate keys (computed once, outside loop) ────────
        const updateOnDuplicate = Object.keys(
            AttendanceBatchProcessInstance.rawAttributes
        ).filter(
            key => ![
                'id',
                'date',
                'employee_id',
                'isDelete',
                'created_date_time',
                'attenance_entry_list',
                'search_string'
            ].includes(key)
        );

        await AttendanceBatchProcessInstance.bulkCreate(upsertValues, { updateOnDuplicate });

        return resSuccess({ ack_msg: "compensation update success" });

    } catch (error) {
        console.error("compensationCalc:", error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    } finally {
        await releaseProcessLock(findCompanyId.company_masters_id, PROCESS_TYPE.ATTENDANCE);
    }
};

export const fetchProcessList = async (req) => {
    try {
        const { a_application_login_id, ll, ul } = req.body;
        const AttendanceBatchProcessInstance = AttendanceBatchProcess(req.tenantDB);
        let offset = Number(ul);
        let limit = Number(ll);
        const results = await AttendanceBatchProcessInstance.findAll({
            attributes: [
                "id",
                [Sequelize.fn('YEAR', Sequelize.col('date')), 'year'],
                [Sequelize.fn('MONTH', Sequelize.col('date')), 'month'],
                [
                    Sequelize.fn('MAX', Sequelize.col('modified_date')),
                    'last_modified_date'
                ]
            ],
            where: {
                isDelete: 0
            },
            group: [
                Sequelize.fn('YEAR', Sequelize.col('date')),
                Sequelize.fn('MONTH', Sequelize.col('date'))
            ],
            order: [
                [Sequelize.literal('year'), 'DESC'],
                [Sequelize.literal('month'), 'DESC']
            ],
            limit,
            offset,
            raw: true
        });

        return resSuccess({ data: results });
    } catch (error) {
        console.error("fetchProcessList:", error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    }
};

export const attendanceDetailUpdate = async (req) => {
    const { a_application_login_id, from_date, to_date } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const lockAcquired = await acquireProcessLock(
        findCompanyId.company_masters_id,
        PROCESS_TYPE.ATTENDANCE,
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
        const attendanceModelInstance = attendanceModel(req.tenantDB);
        const employeePayrollModelInstance = employeePayrollModel(req.tenantDB);
        const AttendanceBatchProcessInstance = AttendanceBatchProcess(req.tenantDB);
        const leavesModelInstance = leavesModel(req.tenantDB);
        const holidayModelInstance = holidayModel(req.tenantDB);
        const AttendanceRoundoffRulesInstance = AttendanceRoundoffRules(req.tenantDB);

        // ── 1. Fetch all active employees (including date_of_joining) ──────
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
            attributes: ["username", "recovery_mobile", "employee_id", "id", "date_of_joining"],
            raw: true
        });

        const employeeIds = activeTeamList.map(e => e.id);
        const employeeJoinDateMap = new Map(
            activeTeamList.map(e => [e.id, e.date_of_joining ? moment(e.date_of_joining).format("YYYY-MM-DD") : null])
        );

        const dateRange = generateDateRange(from_date, to_date);

        // ── 2. Batch fetch attendance + compensation + leave + holiday + payroll + roundoff rules ──
        const [allAttendance, processAttendanceData, leaveData, holidayData, employeePayrollDetail, roundoffRules] = await Promise.all([
            attendanceModelInstance.findAll({
                where: {
                    isDelete: 0,
                    a_application_login_id: { [Op.in]: employeeIds },
                    [Op.and]: [
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('check_in_out_date_time')),
                            { [Op.between]: [from_date, to_date] }
                        )
                    ]
                },
                order: [["check_in_out_date_time", "ASC"]],
                raw: true
            }),
            AttendanceBatchProcessInstance.findAll({
                where: {
                    isDelete: 0,
                    employee_id: { [Op.in]: employeeIds },
                    [Op.and]: [
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('date')),
                            { [Op.between]: [from_date, to_date] }
                        )
                    ]
                },
                order: [["date", "ASC"]],
                raw: true
            }),
            leavesModelInstance.findAll({
                attributes: {
                    include: [
                        [
                            Sequelize.literal(`(
                                SELECT paid_by
                                FROM leave_type_masters ltm
                                WHERE ltm.id = leaves.leave_type_id
                                LIMIT 1
                            )`),
                            'paid_by'
                        ]
                    ]
                },
                where: {
                    isDelete: 0,
                    a_application_login_id: { [Op.in]: employeeIds },
                    [Op.and]: [
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('leave_date')),
                            { [Op.between]: [from_date, to_date] }
                        )
                    ]
                },
                order: [["leave_date", "ASC"]],
                raw: true
            }),
            holidayModelInstance.findAll({
                where: {
                    isDelete: 0,
                    a_application_login_id: { [Op.in]: employeeIds },
                    [Op.and]: [
                        Sequelize.where(
                            Sequelize.fn('DATE', Sequelize.col('holiday_date')),
                            { [Op.between]: [from_date, to_date] }
                        )
                    ]
                },
                order: [["holiday_date", "ASC"]],
                raw: true
            }),
            employeePayrollModelInstance.findAll({
                where: { isDelete: 0, a_application_login_id: { [Op.in]: employeeIds } },
                raw: true
            }),
            // Company-wide roundoff lookup table (one row per minute value 0-59)
            AttendanceRoundoffRulesInstance.findAll({
                where: { isDelete: 0, company_masters_id: findCompanyId.company_masters_id },
                raw: true
            })
        ]);

        const employeePayrollMap = new Map(employeePayrollDetail.map(e => [e.a_application_login_id, e]));
        const roundoffMap = buildRoundoffMap(roundoffRules);

        // ── 3. Group records by employeeId -> date ─────────────────────────
        const grouped = {};
        for (const record of allAttendance) {
            const empId = record.a_application_login_id;
            const date = moment(record.check_in_out_date_time).format("YYYY-MM-DD");
            if (!grouped[empId]) grouped[empId] = {};
            if (!grouped[empId][date]) grouped[empId][date] = [];
            grouped[empId][date].push(record);
        }

        const groupedProcessAttendance = {};
        for (const record of processAttendanceData) {
            const empId = record.employee_id;
            const date = record.date;
            if (!groupedProcessAttendance[empId]) groupedProcessAttendance[empId] = {};
            if (!groupedProcessAttendance[empId][date]) groupedProcessAttendance[empId][date] = [];
            groupedProcessAttendance[empId][date].push(record);
        }

        const groupedLeavesData = {};
        for (const record of leaveData) {
            const empId = record.a_application_login_id;
            const date = moment(record.leave_date).format("YYYY-MM-DD");
            if (!groupedLeavesData[empId]) groupedLeavesData[empId] = {};
            if (!groupedLeavesData[empId][date]) groupedLeavesData[empId][date] = [];
            groupedLeavesData[empId][date].push(record);
        }

        const groupedHolidayData = {};
        for (const record of holidayData) {
            const empId = record.a_application_login_id;
            const date = moment(record.holiday_date).format("YYYY-MM-DD");
            if (!groupedHolidayData[empId]) groupedHolidayData[empId] = {};
            if (!groupedHolidayData[empId][date]) groupedHolidayData[empId][date] = [];
            groupedHolidayData[empId][date].push(record);
        }

        // ── 4. Build upsert payload ──────────────────────────────────────────
        const CurrentdateTime = moment().format("YYYY-MM-DD HH:mm:ss");
        const upsertValues = [];

        for (const empId of employeeIds) {
            const payroll = employeePayrollMap.get(empId);
            const joinDate = employeeJoinDateMap.get(empId);

            const employeeMonthRows = []; // collect this employee's rows before sandwich pass

            for (const date of dateRange) {
                if (joinDate && date < joinDate) continue;

                const records = grouped[empId]?.[date] ?? [];
                const compensation_list = groupedProcessAttendance[empId]?.[date] ?? [];
                const leave_list = groupedLeavesData[empId]?.[date] ?? [];
                const holiday_list = groupedHolidayData[empId]?.[date] ?? [];

                const isWeekOffDay = isWeekOff(date, payroll);
                const isHolidayDay = holiday_list.length > 0;

                if (records.length <= 0 && leave_list.length <= 0 && !isWeekOffDay && !isHolidayDay) continue;

                const { first_in, last_out, total_working_hour, entries } = processAttendance(records);
                const { day_status, late_in, early_out, net_working_hour, overtime_hours, leave_info } = calcDayStatus(
                    date, first_in, last_out, total_working_hour, payroll, compensation_list, leave_list, holiday_list, roundoffMap
                );

                employeeMonthRows.push({
                    employee_id: empId,
                    company_masters_id: findCompanyId.company_masters_id,
                    a_application_login_id: a_application_login_id,
                    last_updated_date: CurrentdateTime,
                    day_status,
                    late_in,
                    early_out,
                    total_working_time: total_working_hour,
                    net_working_hour,
                    overtime_hour: overtime_hours,
                    leave_entry_list: leave_info || [],
                    first_in,
                    last_out,
                    date,
                    attenance_entry_list: entries,
                });
            }

            // ── Sandwich pass: needs the WHOLE month's day_status sequence for
            // this employee, so it runs after the day-loop, before flattening ──
            const sandwichedRows = applySandwichRule(employeeMonthRows, payroll);
            upsertValues.push(...sandwichedRows);
        }

        // ── 5. updateOnDuplicate keys ────────────────────────────────────────
        const updateOnDuplicate = Object.keys(
            AttendanceBatchProcessInstance.rawAttributes
        ).filter(key => !['id', 'date', 'employee_id', 'isDelete', 'created_date_time', 'search_string', 'compensation_list'].includes(key));

        await AttendanceBatchProcessInstance.bulkCreate(upsertValues, { updateOnDuplicate });

        return resSuccess({ ack_msg: "attendance update success" });

    } catch (error) {
        console.error("attendanceDetailUpdate:", error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    } finally {
        await releaseProcessLock(findCompanyId.company_masters_id, PROCESS_TYPE.ATTENDANCE);
    }
};

/**
 * Builds a minute(0-59) -> conversion_minutes lookup Map from the company's
 * attendance_roundoff_rules rows. Each row says "if the leftover minutes-part
 * of a time equals X, convert it to Y minutes" -- Y=0 means drop/round down
 * to the hour, Y=60 means round up to the next hour.
 */
function buildRoundoffMap(roundoffRows) {
    const map = new Map();
    for (const row of roundoffRows) {
        map.set(row.minutes, row.conversion_minutes);
    }
    return map;
}

/**
 * Applies the company's roundoff rule to a total-minutes value.
 *   - hourPart = whole hours, minutePart = leftover minutes (0-59)
 *   - look up minutePart in the roundoff map
 *   - conversion_minutes=0  -> drop the minutes, stay at hourPart
 *   - conversion_minutes=60 -> round up, hourPart + 1 hour, 0 minutes
 *   - any other value -> minutePart becomes that value (rare, but the table
 *     structure technically allows minutes-to-minutes mappings other than 0/60)
 * If no rule row exists for that exact minute value, the original minutes
 * are kept unchanged (no rounding applied) so an incomplete rule set never
 * silently corrupts hours.
 */
function applyRoundoff(totalMins, roundoffMap) {
    if (totalMins <= 0) return 0;
    if (!roundoffMap || roundoffMap.size === 0) return totalMins;

    const hourPart = Math.floor(totalMins / 60);
    const minutePart = totalMins % 60;

    if (!roundoffMap.has(minutePart)) {
        return totalMins; // no rule defined for this remainder -- leave as-is
    }

    const conversion = roundoffMap.get(minutePart);

    if (conversion === 60) {
        return (hourPart + 1) * 60;
    }
    if (conversion === 0) {
        return hourPart * 60;
    }
    // Any other configured value: keep the hour, swap in the converted minutes.
    return (hourPart * 60) + conversion;
}

function processAttendance(records) {
    const sorted = [...records].sort(
        (a, b) => new Date(a.check_in_out_date_time) - new Date(b.check_in_out_date_time)
    );

    const firstIn = sorted.find(r => r.attendance_status === 1);
    const lastOut = [...sorted].reverse().find(r => r.attendance_status === 2);

    // ── Sum working hours across ALL IN→OUT segments, not just first/last ──
    let totalSeconds = 0;
    let pendingIn = null;

    for (const record of sorted) {
        if (record.attendance_status === 1) {
            // New IN punch. If a previous IN was never closed by an OUT,
            // that dangling segment contributes 0 (per spec) and is discarded.
            pendingIn = record;
        } else if (record.attendance_status === 2) {
            if (pendingIn) {
                const ms = new Date(record.check_in_out_date_time) - new Date(pendingIn.check_in_out_date_time);
                if (ms > 0) totalSeconds += Math.floor(ms / 1000);
                pendingIn = null; // segment closed
            }
            // An OUT with no preceding open IN is orphaned — ignored.
        }
    }
    // Trailing pendingIn (no matching OUT) is intentionally left out of the sum.

    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    const totalWorkingHour = `${h}:${m}:${s}`;

    const entries = sorted.map(r => ({
        check_in_out_date_time: r.check_in_out_date_time,
        attendance_status: r.attendance_status,
        attendance_entry_flag: r.attendance_entry_flag,
        attendance_entry_flag: r.attendance_entry_flag,
        image_url: r.image_url,
        total_working_hour: r.total_working_hour,
        address: r.address,
        latitude: r.latitude,
        longitude: r.longitude,
        remark: r.remark,
    }));

    return {
        first_in: firstIn?.check_in_out_date_time ?? null,
        last_out: lastOut?.check_in_out_date_time ?? null,
        total_working_hour: totalWorkingHour,
        entries,
    };
}

/**
 * weekOffDaysOptions: 0=Sunday ... 6=Saturday (JS Date.getDay() convention)
 * payroll.week_off_days is a string, possibly comma-separated for multiple off-days
 * e.g. "0" or "0,6"
 */
function isWeekOff(date, payroll) {
    if (!payroll?.week_off_days) return false;

    const offDays = String(payroll.week_off_days)
        .split(",")
        .map(d => parseInt(d.trim(), 10))
        .filter(d => Number.isFinite(d));

    const dayOfWeek = moment(date, "YYYY-MM-DD").day(); // 0=Sunday...6=Saturday, matches your options
    return offDays.includes(dayOfWeek);
}


/**
 * Converts "HH:MM" or "HH:MM:SS" string → total minutes
 */
function timeStrToMinutes(str) {
    if (!str) return 0;
    const parts = String(str).split(":").map(Number);
    const h = Number.isFinite(parts[0]) ? parts[0] : 0;
    const m = Number.isFinite(parts[1]) ? parts[1] : 0;
    return (h * 60) + m;
}
/**
 * Converts total minutes → "HH:MM:SS" string
 */
function minutesToTimeStr(mins) {
    const absMins = Math.abs(mins);
    const h = String(Math.floor(absMins / 60)).padStart(2, "0");
    const m = String(absMins % 60).padStart(2, "0");
    return `${h}:${m}:00`;
}

const DAY_STATUS = {
    PRESENT: 1,
    HALF_DAY: 2,
    ABSENT: 3,
    LEAVE: 4,
    WEEK_OFF: 5,
    HOLIDAY: 6,
    WOWO: 7,  // Work On Week Off
    WOPH: 8,  // Work On Public Holiday
};

const APPROVED_STATUS = 2; // adjust to your real "approved" leave_status code

const LEAVE_DURATION = {
    FIRST_HALF: 1,
    SECOND_HALF: 2,
    FULL_DAY: 3,
    HOURLY: 4,
};

/**
 * Only a FULL_DAY (leave_duration=3) approved leave overrides day_status to
 * LEAVE(4). First-half, second-half, and hourly leaves are PARTIAL -- the
 * employee still worked part of the day, so day_status is computed normally
 * from actual attendance (present/half_day/absent) instead of being forced
 * to "leave". leave_info is still returned either way so the caller always
 * has visibility into any leave record that exists for the date.
 */
function resolveLeaveOverride(leave_list) {
    if (!Array.isArray(leave_list) || leave_list.length === 0) {
        return { isLeave: false, leave_info: [] };
    }

    const fullDayApprovedLeaves = leave_list.filter(
        l => l.leave_status === APPROVED_STATUS && l.leave_duration === LEAVE_DURATION.FULL_DAY
    );

    const leave_info = leave_list.map(l => ({
        leave_type_id: l.leave_type_id,
        leave_status: l.leave_status,
        leave_duration: l.leave_duration,
        paid_by: l.paid_by,
        hourly_leave_duration: l.hourly_leave_duration,
    }));

    return { isLeave: fullDayApprovedLeaves.length > 0, leave_info };
}

const SANDWICH_RULE_APPLIED = { WEEK_OFF: 1, HOLIDAY: 2, BOTH: 3 };
const SANDWICH_RULE_TYPE = { FULL_ONLY: 1, FULL_OR_HALF: 2 };

/**
 * Determines whether a given day_status counts as an "off-day" that the
 * sandwich rule should evaluate, based on payroll.sandwich_rule_applied.
 */
function isSandwichEligibleOffDay(dayStatus, sandwichRuleApplied) {
    if (sandwichRuleApplied === SANDWICH_RULE_APPLIED.WEEK_OFF) {
        return dayStatus === DAY_STATUS.WEEK_OFF;
    }
    if (sandwichRuleApplied === SANDWICH_RULE_APPLIED.HOLIDAY) {
        return dayStatus === DAY_STATUS.HOLIDAY;
    }
    if (sandwichRuleApplied === SANDWICH_RULE_APPLIED.BOTH) {
        return dayStatus === DAY_STATUS.WEEK_OFF || dayStatus === DAY_STATUS.HOLIDAY;
    }
    return false;
}

/**
 * Walks one employee's already-built rows for the month (sorted by date)
 * and sets is_sandwich_applied=1 on any WEEK_OFF/HOLIDAY row that satisfies
 * the configured sandwich pattern:
 *
 *   Type 1 (FULL_ONLY):    only LEAVE | OFF | LEAVE triggers it
 *   Type 2 (FULL_OR_HALF): LEAVE | OFF  OR  LEAVE | OFF | LEAVE triggers it
 *
 * "LEAVE" here means that neighboring row's day_status === LEAVE(4).
 * Consecutive off-days are NOT specially merged into one block -- each
 * individual WEEK_OFF/HOLIDAY row is checked against its own immediate
 * previous/next row in the sorted sequence (which may itself be another
 * off-day, in which case that neighbor is simply not LEAVE and the
 * sandwich condition on that side is false, exactly as a plain index
 * lookup would produce with no special-casing needed).
 */
function applySandwichRule(monthRows, payroll) {
    if (!payroll) return monthRows;

    const sandwichRuleApplied = parseInt(payroll.sandwich_rule_applied, 10);
    const sandwichRuleType = parseInt(payroll.sandwich_rule_type, 10);

    if (!sandwichRuleApplied || !sandwichRuleType) return monthRows;

    const sorted = [...monthRows].sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 0; i < sorted.length; i++) {
        const row = sorted[i];
        row.is_sandwich_applied = 0; // default

        if (!isSandwichEligibleOffDay(row.day_status, sandwichRuleApplied)) continue;

        const prevRow = sorted[i - 1];
        const nextRow = sorted[i + 1];

        const prevIsLeave = prevRow?.day_status === DAY_STATUS.LEAVE;
        const nextIsLeave = nextRow?.day_status === DAY_STATUS.LEAVE;

        const isFullSandwich = prevIsLeave && nextIsLeave;
        const isHalfSandwich = prevIsLeave || nextIsLeave; // one side only

        if (sandwichRuleType === SANDWICH_RULE_TYPE.FULL_ONLY) {
            if (isFullSandwich) row.is_sandwich_applied = 1;
        } else if (sandwichRuleType === SANDWICH_RULE_TYPE.FULL_OR_HALF) {
            if (isFullSandwich || isHalfSandwich) row.is_sandwich_applied = 1;
        }
    }

    return sorted;
}

function calcDayStatus(date, first_in, last_out, total_working_hour, payroll, compensation_list, leave_list = [], holiday_list = [], roundoffMap = null) {
    const { isLeave, leave_info } = resolveLeaveOverride(leave_list);
    const isHoliday = Array.isArray(holiday_list) && holiday_list.length > 0;
    const isWeekOffDay = isWeekOff(date, payroll);

    const rawWorkingMins = timeStrToMinutes(total_working_hour);
    const hasAnyWork = rawWorkingMins > 0;

    if (isWeekOffDay) {
        if (hasAnyWork) {
            return buildWorkOnOffDayResult(DAY_STATUS.WOWO, total_working_hour, payroll, leave_info);
        }
        return {
            day_status: DAY_STATUS.WEEK_OFF,
            late_in: null, early_out: null,
            net_working_hour: "00:00:00", overtime_hours: "00:00:00",
            leave_info,
        };
    }

    if (isHoliday) {
        if (hasAnyWork) {
            return buildWorkOnOffDayResult(DAY_STATUS.WOPH, total_working_hour, payroll, leave_info);
        }
        return {
            day_status: DAY_STATUS.HOLIDAY,
            late_in: null, early_out: null,
            net_working_hour: "00:00:00", overtime_hours: "00:00:00",
            leave_info,
        };
    }

    if (!payroll) {
        return {
            day_status: isLeave ? DAY_STATUS.LEAVE : 0,
            late_in: null, early_out: null,
            net_working_hour: "00:00:00", overtime_hours: "00:00:00",
            leave_info,
        };
    }

    const firstInStr = first_in ? moment(first_in).format("YYYY-MM-DD HH:mm:ss") : null;
    const lastOutStr = last_out ? moment(last_out).format("YYYY-MM-DD HH:mm:ss") : null;

    const gracePeriodMins = parseInt(payroll.grace_period ?? 0, 10);
    const minPresentMins = timeStrToMinutes(payroll.min_present_hours);
    const halfDayMins = timeStrToMinutes(payroll.half_day_hours);
    const minOvertimeMins = timeStrToMinutes(payroll.min_overtime_hours);
    const maxOvertimeMins = timeStrToMinutes(payroll.approve_ot_hours);

    // ── Break is already excluded by processAttendance's segment summing;
    // no second break deduction here anymore. Only compensation adjusts it. ──
    const compensationMins = calcCompensationMinutes(compensation_list);
    const netWorkingMinsRaw = Math.max(0, rawWorkingMins + compensationMins);

    // ── Apply company roundoff rule to working hour ────────────────────────
    const netWorkingMins = applyRoundoff(netWorkingMinsRaw, roundoffMap);
    const netWorkingHourStr = minutesToTimeStr(netWorkingMins);

    let day_status;
    if (isLeave) {
        day_status = DAY_STATUS.LEAVE;
    } else if (netWorkingMins >= minPresentMins) {
        day_status = DAY_STATUS.PRESENT;
    } else if (netWorkingMins >= halfDayMins) {
        day_status = DAY_STATUS.HALF_DAY;
    } else {
        day_status = DAY_STATUS.ABSENT;
    }

    // ── Overtime computed from the ROUNDED net working hour, then rounded
    // again independently (per your confirmed answer: round each separately) ──
    const overtimeMinsRaw = calcOvertimeMinutes(netWorkingMins, minPresentMins, halfDayMins, minOvertimeMins, maxOvertimeMins);
    const overtimeMins = applyRoundoff(overtimeMinsRaw, roundoffMap);
    const overtimeHourStr = minutesToTimeStr(overtimeMins);

    let late_in = null;
    if (firstInStr) {
        const datePrefix = firstInStr.slice(0, 10);
        const scheduledIn = moment(`${datePrefix} ${payroll.daily_in_time}`, "YYYY-MM-DD HH:mm:ss");
        const graceIn = scheduledIn.clone().add(gracePeriodMins, "minutes");
        const actualIn = moment(firstInStr, "YYYY-MM-DD HH:mm:ss");
        if (actualIn.isAfter(graceIn)) {
            late_in = minutesToTimeStr(actualIn.diff(scheduledIn, "minutes"));
        }
    }

    let early_out = null;
    if (lastOutStr) {
        const datePrefix = lastOutStr.slice(0, 10);
        const scheduledOut = moment(`${datePrefix} ${payroll.daily_out_time}`, "YYYY-MM-DD HH:mm:ss");
        const graceOut = scheduledOut.clone().subtract(gracePeriodMins, "minutes");
        const actualOut = moment(lastOutStr, "YYYY-MM-DD HH:mm:ss");
        if (actualOut.isBefore(graceOut)) {
            early_out = minutesToTimeStr(scheduledOut.diff(actualOut, "minutes"));
        }
    }

    return { day_status, late_in, early_out, net_working_hour: netWorkingHourStr, overtime_hours: overtimeHourStr, leave_info };
}

/**
 * For WOWO/WOPH: all worked time is overtime, late_in/early_out don't apply
 * (there's no "scheduled" shift to be late/early against on an off-day).
 */
function buildWorkOnOffDayResult(statusCode, total_working_hour, payroll, leave_info = []) {
    const rawWorkingMins = timeStrToMinutes(total_working_hour);
    const breakMins = timeStrToMinutes(payroll?.daily_break_hours);
    const netWorkingMins = Math.max(0, rawWorkingMins - breakMins);

    return {
        day_status: statusCode,
        late_in: null,
        early_out: null,
        net_working_hour: minutesToTimeStr(netWorkingMins),
        overtime_hours: minutesToTimeStr(netWorkingMins), // all working hour = overtime
        leave_info: leave_info || [],
    };
}

/**
 * Sums compensation adjustments into a net minutes delta.
 * adjustment_type 1 = credit (add hours)
 * adjustment_type 2 = debit  (subtract hours)
 * Any other adjustment_type is ignored for working-hour purposes.
 *
 * @param {Array|string} compensation_list - array of {adjustment_type, amount, hours} OR JSON string
 * @returns {number} net minutes to add (+) or subtract (-) from working hours
 */
function calcCompensationMinutes(compensation_list) {
    let list = compensation_list;

    if (typeof list === 'string') {
        try {
            list = JSON.parse(list);
        } catch {
            list = [];
        }
    }

    if (!Array.isArray(list) || list.length === 0) return 0;

    let netMinutes = 0;
    for (const item of list) {
        const hours = Number(item.hours) || 0;
        const mins = hours * 60;

        if (item.adjustment_type === 1) {
            netMinutes += mins;   // credit
        } else if (item.adjustment_type === 2) {
            netMinutes -= mins;   // debit
        }
        // other adjustment_types ignored
    }

    return netMinutes;
}

/**
 * Calculates overtime_hours based on net_working_hour vs payroll thresholds.
 *
 * Case 1 (present): netWorkingMins > minPresentMins
 *   excess = netWorkingMins - minPresentMins
 *   if excess > minOvertimeMins → overtime = excess
 *
 * Case 2 (half-day): halfDayMins < netWorkingMins < minPresentMins
 *   excess = netWorkingMins - halfDayMins
 *   if excess > minOvertimeMins → overtime = excess
 *
 * Otherwise → overtime = 0
 */
function calcOvertimeMinutes(netWorkingMins, minPresentMins, halfDayMins, minOvertimeMins, maxOvertimeMins = 0) {
    let excessMins = 0;

    if (netWorkingMins > minPresentMins) {
        // Case 1: present, beyond min_present_hours
        excessMins = netWorkingMins - minPresentMins;
    } else if (netWorkingMins > halfDayMins && netWorkingMins < minPresentMins) {
        // Case 2: half-day range, beyond half_day_hours
        excessMins = netWorkingMins - halfDayMins;
    }

    if (excessMins > minOvertimeMins) {
        if (maxOvertimeMins > 0 && excessMins > maxOvertimeMins) {
            return maxOvertimeMins;
        }
        return excessMins;
    }

    return 0;
}


const DAY_STATUS_CODE_MAP = {
    1: "P",
    2: "HD",
    3: "A",
    4: "L",
    5: "WO",
    6: "PH",
    7: "WOWO",
    8: "WOPH",
};

function timeStrToHHMM(str) {
    // "08:30:00" -> "08:30" ; null/blank -> ""
    if (!str) return "";
    const parts = String(str).split(":");
    return `${parts[0].padStart(2, "0")}:${parts[1] ?? "00"}`;
}

function minutesToHHMM(mins) {
    const absMins = Math.abs(Math.round(mins));
    const h = String(Math.floor(absMins / 60)).padStart(2, "0");
    const m = String(absMins % 60).padStart(2, "0");
    return `${h}:${m}`;
}

/**
 * Reconstructs IN/OUT punch pairs for display from the stored
 * attenance_entry_list JSON (same closed-segment pairing logic
 * used by processAttendance, but returning display pairs instead
 * of a duration sum).
 */
function buildPunchPairs(entryList) {
    let entries = entryList;
    if (typeof entries === "string") {
        try { entries = JSON.parse(entries); } catch { entries = []; }
    }
    if (!Array.isArray(entries)) return [];

    const sorted = [...entries].sort(
        (a, b) => new Date(a.check_in_out_date_time) - new Date(b.check_in_out_date_time)
    );

    const pairs = [];
    let pendingIn = null;

    for (const entry of sorted) {
        if (entry.attendance_status === 1) {
            pendingIn = entry;
        } else if (entry.attendance_status === 2) {
            if (pendingIn) {
                pairs.push({
                    in: moment(pendingIn.check_in_out_date_time).format("HH:mm"),
                    out: moment(entry.check_in_out_date_time).format("HH:mm"),
                });
                pendingIn = null;
            }
        }
    }
    // Dangling pendingIn (no matching OUT) is intentionally omitted from
    // display pairs, consistent with how it's excluded from hour totals.

    return pairs;
}

const MONTHLY_COUNT_STATUS_KEYS = {
    present: [1],
    absent: [3],
    halfDay: [2],
    weekOff: [5, 7],   // WOWO folds into weekOff count, consistent with salary bucketing
    holiday: [6, 8],   // WOPH folds into holiday count, consistent with salary bucketing
    leave: [4],
};

export const getAttendanceDetail = async (req) => {
    try {
        const { employeeIds, month, year } = req.body;

        const empployeeidsArr = employeeIds ? employeeIds.split(",") : [];
        // employeeIds: array of ints, e.g. [1, 10, 11]
        // month: "5" or 5 ; year: "2026" or 2026

        const monthPadded = String(month).padStart(2, "0");
        const monthStart = moment(`${year}-${monthPadded}-01`, "YYYY-MM-DD").format("YYYY-MM-DD");
        const monthEnd = moment(monthStart, "YYYY-MM-DD").endOf("month").format("YYYY-MM-DD");

        const AttendanceBatchProcessInstance = AttendanceBatchProcess(req.tenantDB);
        const employeePayrollModelInstance = employeePayrollModel(req.tenantDB);

        // ── Batch fetch ──────────────────────────────────────────────────
        const [batchRows, payrollRows] = await Promise.all([
            AttendanceBatchProcessInstance.findAll({
                where: {
                    isDelete: 0,
                    employee_id: { [Op.in]: empployeeidsArr },
                    date: { [Op.between]: [monthStart, monthEnd] }
                },
                order: [["employee_id", "ASC"], ["date", "ASC"]],
                raw: true
            }),
            employeePayrollModelInstance.findAll({
                where: { isDelete: 0, a_application_login_id: { [Op.in]: empployeeidsArr } },
                raw: true
            })
        ]);

        const payrollByEmp = new Map(payrollRows.map(p => [p.a_application_login_id, p]));

        // ── Group batch rows by employee -> date for quick lookup ─────────
        const batchByEmpDate = {};
        for (const row of batchRows) {
            batchByEmpDate[row.employee_id] ??= {};
            batchByEmpDate[row.employee_id][row.date] = row;
        }

        const daysInMonth = moment(monthStart, "YYYY-MM-DD").daysInMonth();

        const daysWise = {};
        const monthlyCount = {};

        for (const empId of empployeeidsArr) {
            const payroll = payrollByEmp.get(empId);
            const officialWorkHrs = payroll ? timeStrToHHMM(payroll.daily_working_hours) : "";

            const dayList = [];
            const counts = {
                present: 0, absent: 0, halfDay: 0, weekOff: 0, holiday: 0,
                lateDays: 0, earlyDays: 0, leave: 0,
                workMins: 0, officeMins: 0, otMins: 0,
            };

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = moment(monthStart, "YYYY-MM-DD").date(d).format("YYYY-MM-DD");
                const row = batchByEmpDate[empId]?.[dateStr];

                const weekday = moment(dateStr, "YYYY-MM-DD").format("ddd");

                if (!row) {
                    // No batch row at all for this date (e.g. ordinary day with
                    // zero attendance and zero leave, per the attendance engine's
                    // skip logic) -> show as blank/unprocessed day.
                    dayList.push({
                        day: String(d).padStart(2, "0"),
                        weekday,
                        status: "",
                        punches: [],
                        actualWorkHrs: "",
                        officialWorkHrs,
                        otOs: "",
                        late: "",
                        early: "",
                    });
                    continue;
                }

                const statusCode = DAY_STATUS_CODE_MAP[row.day_status] ?? "";

                dayList.push({
                    day: String(d).padStart(2, "0"),
                    weekday,
                    status: statusCode,
                    punches: buildPunchPairs(row.attenance_entry_list),
                    actualWorkHrs: timeStrToHHMM(row.net_working_hour),
                    officialWorkHrs,
                    otOs: timeStrToHHMM(row.overtime_hour),
                    late: timeStrToHHMM(row.late_in),
                    early: timeStrToHHMM(row.early_out),
                });

                // ── Monthly count aggregation ──────────────────────────────
                if (MONTHLY_COUNT_STATUS_KEYS.present.includes(row.day_status)) counts.present += 1;
                if (MONTHLY_COUNT_STATUS_KEYS.absent.includes(row.day_status)) counts.absent += 1;
                if (MONTHLY_COUNT_STATUS_KEYS.halfDay.includes(row.day_status)) counts.halfDay += 1;
                if (MONTHLY_COUNT_STATUS_KEYS.weekOff.includes(row.day_status)) counts.weekOff += 1;
                if (MONTHLY_COUNT_STATUS_KEYS.holiday.includes(row.day_status)) counts.holiday += 1;
                if (MONTHLY_COUNT_STATUS_KEYS.leave.includes(row.day_status)) counts.leave += 1;

                if (row.late_in) counts.lateDays += 1;
                if (row.early_out) counts.earlyDays += 1;

                counts.workMins += timeStrToMinutes(row.net_working_hour);
                counts.officeMins += timeStrToMinutes(payroll?.daily_working_hours);
                counts.otMins += timeStrToMinutes(row.overtime_hour);
            }

            daysWise[empId] = dayList;
            monthlyCount[empId] = {
                present: counts.present,
                absent: counts.absent,
                halfDay: counts.halfDay,
                weekOff: counts.weekOff,
                holiday: counts.holiday,
                lateDays: counts.lateDays,
                earlyDays: counts.earlyDays,
                workHrs: minutesToHHMM(counts.workMins),
                officeHrs: minutesToHHMM(counts.officeMins),
                ot: minutesToHHMM(counts.otMins),
                leave: counts.leave,
            };
        }

        return resSuccess({ data: { daysWise, monthlyCount } });

    } catch (error) {
        console.error("getAttendanceDetail:", error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    }
};

export const getEmployeeDetail = async (req) => {
    try {
        const { employee_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(employee_id);

        const employee = await loginModel.findAll({
            where: {
                id: {
                    [Op.in]: Sequelize.literal(`(
                        SELECT a_application_login_id
                        FROM company_vs_application_logins
                        WHERE isDelete = 0
                        AND company_masters_id = '${findCompanyId.company_masters_id}' AND a_application_login_id = '${employee_id}'
                    )`)
                },
                isDelete: 0
            },
            raw: true
        });

        if (!employee) {
            return resBadRequest({ ack: 0, developer_msg: "Employee not found" });
        }

        // ── TEST VALUES — replace with real columns once the HR/employee
        // detail table/model is available. Wiring point only. ─────────────
        const responsePayload = {
            ecode: employee[0].employee_id || "",
            name: employee[0].username || "",
            contact_number: employee[0].recovery_mobile || "",
            department: "",
            designation: "",
            dateOfJoining: "",
        };

        return resSuccess({ data: responsePayload });

    } catch (error) {
        console.error("getEmployeeDetail:", error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    }
};