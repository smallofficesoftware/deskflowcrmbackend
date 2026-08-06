import { Op, Sequelize } from "sequelize";
import companyVsApplicationLoginModel from "../../../models/company_setup/companyVsApplicationLoginModel.js";
import { AttendanceBatchProcess } from "../../../models/hr/processAttendanceModel.js";
import { getCompanyByLoginId } from "../../../services/commonServices.js";
import { resBadRequest, resError, resSuccess } from "../../../utils/sharedFunctions.js";

export const DAY_STATUS = {
    1: "P",
    2: "HD",
    3: "A",
    4: "L",
    5: "WO",
    6: "PH",
    7: "WOWO", // Work On Week Off
    8: "WOPH", // Work On Public Holiday
};

export const processAttendanceGet = async (req) => {
    const selectedTeamMembers = req.body.selectedTeamMembers || [];
    const selectedDayMonthYear = req.body.selectedDayMonthYear || [];

    try {
        const AttendanceBatchProcessInstance = AttendanceBatchProcess(req.tenantDB);

        const findCompanyId = await getCompanyByLoginId(
            req.body.a_application_login_id
        );

        // Modify the query to filter by selectedTeamMembers if provided
        let whereClauseForCompany = {
            isDelete: 0,
        };

        if (selectedTeamMembers.length > 0) {
            whereClauseForCompany.a_application_login_id = {
                [Op.in]: selectedTeamMembers,
            };
        } else {
            whereClauseForCompany.company_masters_id = findCompanyId.company_masters_id
        }

        const companyVsApplicationLoginResult =
            await companyVsApplicationLoginModel.findAll({
                where: whereClauseForCompany,
                attributes: [
                    "a_application_login_id",
                    [
                        Sequelize.literal(`(
                                        SELECT a_application_logins.username
                                        FROM a_application_logins
                                        WHERE a_application_logins.id = company_vs_application_logins.a_application_login_id
                                        AND a_application_logins.isDelete = 0
                                        LIMIT 1
                                    )`),
                        "employee_name"
                    ],
                ]
            });

        let whereClauseForAttendance = {
            isDelete: 0,
        };

        if (selectedDayMonthYear.length === 3) {
            const [day, month, year] = selectedDayMonthYear;

            const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

            whereClauseForAttendance.date = date;

        } else if (selectedDayMonthYear.length === 2) {
            const [month, year] = selectedDayMonthYear;

            const startDate = `${year}-${String(month).padStart(2, "0")}-01`;

            const endDate =
                month === 12
                    ? `${year + 1}-01-01`
                    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

            whereClauseForAttendance.date = {
                [Op.gte]: startDate,
                [Op.lt]: endDate,
            };
        }

        const timeToSeconds = (time) => {
            const [hours, minutes, seconds] = time.split(":").map(Number);
            return hours * 3600 + minutes * 60 + seconds;
        };

        const secondsToTime = (totalSeconds) => {
            const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
            const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
            const seconds = String(totalSeconds % 60).padStart(2, "0");

            return `${hours}:${minutes}:${seconds}`;
        };

        const finalResult = await Promise.all(
            companyVsApplicationLoginResult.map(async (emp) => {
                whereClauseForAttendance.employee_id = emp.dataValues.a_application_login_id;

                const result = await AttendanceBatchProcessInstance.findAll({
                    where: whereClauseForAttendance,
                    attributes: [
                        "id",
                        "date",
                        "employee_id",
                        "search_string",
                        "last_updated_date",
                        "day_status",
                        "total_working_time",
                        "net_working_hour",
                        "roundoff_hours",
                        "overtime_hour",
                        "regular_overtime_hour",
                        "extra_overtime_hour",
                        "early_out",
                        "late_in",
                        "first_in",
                        "last_out",
                        "attenance_entry_list",
                    ],
                    raw: true,
                });

                const totalWorkingSeconds = result.reduce(
                    (sum, row) => sum + timeToSeconds(row.total_working_time || "00:00:00"),
                    0
                );

                const netWorkingSeconds = result.reduce(
                    (sum, row) => sum + timeToSeconds(row.net_working_hour || "00:00:00"),
                    0
                );

                const roundoffSeconds = result.reduce(
                    (sum, row) => sum + timeToSeconds(row.roundoff_hours || "00:00:00"),
                    0
                );

                const overtimeSeconds = result.reduce(
                    (sum, row) => sum + timeToSeconds(row.overtime_hour || "00:00:00"),
                    0
                );

                const regularOtSeconds = result.reduce(
                    (sum, row) => sum + timeToSeconds(row.regular_overtime_hour || (row.day_status === 2 ? row.overtime_hour : "00:00:00")),
                    0
                );

                const extraOtSeconds = result.reduce(
                    (sum, row) => sum + timeToSeconds(row.extra_overtime_hour || (row.day_status !== 2 ? row.overtime_hour : "00:00:00")),
                    0
                );

                const statusCount = {};

                Object.values(DAY_STATUS).forEach(status => {
                    statusCount[status] = 0;
                });

                result.forEach(row => {
                    const status = DAY_STATUS[row.day_status];
                    if (status) {
                        statusCount[status]++;
                    }
                });

                return {
                    employee_name: emp.dataValues.employee_name,
                    total_working_time_sum: secondsToTime(totalWorkingSeconds),
                    roundoff_hour_sum: secondsToTime(roundoffSeconds),
                    net_working_hour_sum: secondsToTime(netWorkingSeconds),
                    overtime_hour_sum: secondsToTime(overtimeSeconds),
                    regular_ot_hour_sum: secondsToTime(regularOtSeconds),
                    extra_ot_hour_sum: secondsToTime(extraOtSeconds),
                    status_count: statusCount,
                    presentDates: result,
                };
            })
        );

        if (finalResult.length > 0) {
            return resSuccess({
                data: { item: finalResult },
                ack_msg: "Process Attendance report fetched successfully",
            });
        } else {
            return resError({
                developer_msg: "Attendance Data not found",
                ack_msg: "Failed to fetch Process Attendance",
            });
        }
    } catch (e) {
        console.log("processAttendanceGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};