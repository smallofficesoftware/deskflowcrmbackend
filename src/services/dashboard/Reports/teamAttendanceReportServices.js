import moment from "moment";
import { col, Op } from "sequelize";
import sequelize from "../../../config/sequelize.js";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import loginModel from "../../../models/application_login/loginModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../../models/company_setup/companyVsApplicationLoginModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { attendanceModel } from "../../../models/hr/attendanceModel.js";
import { employeePayrollModel } from "../../../models/hr/employeePayrollModel.js";
import { leavesModel } from "../../../models/hr/leavesModel.js";
import { leaveTypeModel } from "../../../models/hr/leaveTypeModel.js";
import { BACKEND_OF_SMALL_OFFICE_CRM_END_POINT } from "../../../utils/appConstants.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import {
  formatDateAndTimeCreateDateTime,
  resError,
  resSuccess,
  sanitizeObjectOfNull,
} from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

const generateDateRange = (start, end) => {
  const dates = [];
  let current = moment(start);

  while (current.isSameOrBefore(end, "day")) {
    dates.push(current.format("YYYY-MM-DD"));
    current.add(1, "day");
  }

  return dates;
};

const convertToHHMMSS = (totalSeconds) => {
  const seconds = Math.floor(totalSeconds);

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(remainingSeconds).padStart(2, "0"),
  ].join(":");
};



export const getTeamAttendanceReport = async (req) => {
  const selectedDates = req.body.selectedDates || [];
  const selectedTeamMembers = req.body.selectedTeamMembers || [];
  const { ll, // offset (number)
    ul, // limit (number)
  } = req.body

  const globalSearch = req.body.globalSearch?.trim() || "";


  const offset = ul;
  const limit = ll;
  const LeaveTypeModel = leaveTypeModel(req.tenantDB);


  let fullTextSearchCondition = {};

  if (globalSearch) {
    // Get all text-type columns from loginModel (no tenantDB needed)
    const loginTextColumns = Object.keys(loginModel.rawAttributes)
      .filter(col => {
        const attr = loginModel.rawAttributes[col];
        return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
      });

    const likePattern = `%${globalSearch}%`;
    const orConditions = loginTextColumns.map(col => ({
      [col]: { [Op.like]: likePattern }
    }));

    fullTextSearchCondition = { [Op.or]: orConditions };
  }

  const startDate = new Date(selectedDates[0]);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(selectedDates[1]);
  endDate.setHours(23, 59, 59, 999);

  const findCompanyId = await getCompanyByLoginId(
    req.body.a_application_login_id
  );

  let targetCompanyId = findCompanyId?.company_masters_id;
  let targetCompanyIds = targetCompanyId ? [targetCompanyId] : [];

  if (targetCompanyId) {
    const companyRecord = await companyModel.findOne({
      where: { id: targetCompanyId, isDelete: 0 },
      attributes: ["id", "parent_company_id"],
      raw: true
    });

    if (companyRecord) {
      if (companyRecord.parent_company_id) {
        targetCompanyIds = [targetCompanyId, companyRecord.parent_company_id];
      } else {
        const subWorkspaces = await companyModel.findAll({
          where: { parent_company_id: targetCompanyId, isDelete: 0 },
          attributes: ["id"],
          raw: true
        });
        if (subWorkspaces && subWorkspaces.length > 0) {
          targetCompanyIds = [targetCompanyId, ...subWorkspaces.map(w => w.id)];
        }
      }
    }
  }

  // Modify the query to filter by selectedTeamMembers if provided
  let whereClause = {
    isDelete: 0,
  };

  const a_application_login_type_rights = req.body.a_application_login_id;
  const { showAllData, showPersonalData } = await getUserRights({
    company_masters_id: findCompanyId.company_masters_id,
    a_application_login_id: a_application_login_type_rights,
    page_id: PAGE_ID.ATTEDANCESALARY_REPORT,
    tenentId: req.tenantDB
  });

  if (showAllData) {
    whereClause = {
      isDelete: 0,
      company_masters_id: { [Op.in]: targetCompanyIds },
    }
  }
  else if (showPersonalData) {
    whereClause = {
      isDelete: 0,
      a_application_login_id: req.body.a_application_login_id
    }
  }


  if (selectedTeamMembers.length > 0) {
    whereClause.a_application_login_id = {
      [Op.in]: selectedTeamMembers,
    };
  }

  const companyVsApplicationLoginResult =
    await companyVsApplicationLoginModel.findAll({
      where: whereClause,
      offset: (offset !== undefined && limit !== undefined && Number(limit) > 0) ? Number(offset) : undefined,
      limit: (limit !== undefined && Number(limit) > 0) ? Number(limit) : undefined,
    });

  const companyCurrency = await companyModel.findOne({
    where: {
      id: { [Op.in]: targetCompanyIds },
      isDelete: 0,
    },
    attributes: ["currency_id"],
  });

  const currency = await currencyModel.findOne({
    where: {
      id: companyCurrency?.currency_id,
      isDelete: 0,
    },
    attributes: ["id", "symbol"],
  });

  const leaveTypes = await LeaveTypeModel.findAll({
    where: {
      company_masters_id: { [Op.in]: targetCompanyIds },
      isDelete: 0,
    },
    raw: true,
  });

  const leaveTypeMap = {};

  leaveTypes.forEach(type => {
    leaveTypeMap[type.id] = type.paid_by;
  });
  const empPayrollModel = employeePayrollModel(req.tenantDB);


  const teamData = await Promise.all(
    companyVsApplicationLoginResult.map(async (item) => {
      const employeePayrollData = await empPayrollModel.findOne({
        where: {
          a_application_login_id: item.a_application_login_id,
          isDelete: 0,
        },
        attributes: ["min_present_hours", "salary_type", "salary_amount_type_wise", "week_off_days", "daily_working_hours"],
        raw: true,
      });

      const a_application_logins = await loginModel.findAll({
        where: {
          isDelete: 0,
          id: item.a_application_login_id,
          ...fullTextSearchCondition
        },
        attributes: [
          "username"],
      });


      if (!a_application_logins || a_application_logins.length === 0) {
        return null;   // OR return {}; OR don’t return at all
      }
      const username = a_application_logins[0]?.username || "Unknown";
      // const salary = a_application_logins[0]?.per_hour_salary
      //   ? `${currency?.symbol || ""} ${a_application_logins[0]?.per_hour_salary} `
      //   : "0";
      const weekOffDays = employeePayrollData?.week_off_days || "";

      const weekOffArray = weekOffDays
        ? weekOffDays.split(",").map(Number)
        : [];
      let dailyWorkingHours = 0;

      const dailyWorkingHoursRaw =
        employeePayrollData?.daily_working_hours || "00:00";

      if (dailyWorkingHoursRaw.includes(":")) {
        const parts = dailyWorkingHoursRaw.split(":");
        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;

        dailyWorkingHours = hours + (minutes / 60);
      } else {
        dailyWorkingHours = Number(dailyWorkingHoursRaw) || 0;
      }

      // Parse min_present_hours (in HH:MM format)
      let minPresentHoursDecimal = 0;
      const minPresentRaw = employeePayrollData?.min_present_hours || "00:00";
      if (minPresentRaw.includes(":")) {
        const [hours, minutes] = minPresentRaw.split(":").map(Number);
        minPresentHoursDecimal = hours + (minutes / 60);
      } else {
        minPresentHoursDecimal = Number(minPresentRaw) || 0;
      }

      const salaryType = Number(employeePayrollData?.salary_type || 0);
      const salaryAmount = Number(employeePayrollData?.salary_amount_type_wise || 0);



      const LMmodel = leavesModel(req.tenantDB);

      const leaveData = await LMmodel.findAll({
        where: {
          a_application_login_id: item.a_application_login_id,
          company_masters_id: { [Op.in]: targetCompanyIds },
          [Op.and]: [
            sequelize.where(
              sequelize.fn("DATE", sequelize.col("leave_date")),
              {
                [Op.gte]: moment(startDate).format("YYYY-MM-DD"),
                [Op.lte]: moment(endDate).format("YYYY-MM-DD"),
              }
            ),
          ],
          isDelete: 0,
          leave_status: 2 // 2 = approved/Pass
        },
        raw: true,
      });
      console.log("Fetched Leaves:", leaveData);
      let companyPaidLeave = 0;
      let employeePaidLeave = 0;

      const durationMap = {
        1: 0.5,
        2: 0.5,
        3: 1
      };

      leaveData.forEach((leave) => {

        const start = moment(leave.leave_date).startOf("day");
        const end = leave.reporting_date
          ? moment(leave.reporting_date).startOf("day")
          : start.clone().add(1, "day");

        // 🔹 Count total days (reporting_date exclusive)
        const totalDays = end.diff(start, "days");

        const durationValue = durationMap[leave.leave_duration] || 0;

        // 🔹 Final leave count
        const leaveCount = totalDays * durationValue;

        const paidBy = leaveTypeMap[leave.leave_type_id];

        if (paidBy === 1) {
          companyPaidLeave += leaveCount;
        }

        if (paidBy === 2) {
          employeePaidLeave += leaveCount;
        }

      });



      const AMmodel = attendanceModel(req.tenantDB);

      if (req.body.request_flag === 1) {
        const viewAttendance = await AMmodel.findOne({
          where: {
            company_masters_id: { [Op.in]: targetCompanyIds },
            a_application_login_id: item.a_application_login_id,
            isDelete: "0",
          },
          order: [["check_in_out_date_time", "DESC"]],
          attributes: ["attendance_status"],
        });
        if (viewAttendance) {
          return resSuccess({
            ack_msg: "Attendance view",
            data: viewAttendance.attendance_status,
          });
        } else {
          return resError({
            ack_msg: "something went wrong",
            developer_msg: "Data not found",
          });
        }
      } else {

        const viewAttendance = await AMmodel.findAll({
          where: {
            a_application_login_id: item.a_application_login_id,
            isDelete: "0",
            [Op.and]: [
              sequelize.where(
                sequelize.fn("DATE", sequelize.col("check_in_out_date_time")),
                {
                  [Op.gte]: moment(startDate).format("YYYY-MM-DD"),
                  [Op.lte]: moment(endDate).format("YYYY-MM-DD"),
                }
              ),
            ],
          },
          attributes: {
            include: [
              [
                sequelize.fn("DATE", col("check_in_out_date_time")),
                "attendanceDate",
              ],
              [
                sequelize.fn("TIME", col("check_in_out_date_time")),
                "attendanceTime",
              ],
            ],
          },
          order: [["check_in_out_date_time", "ASC"]],
        });

        const sanitizeData =
          viewAttendance &&
          viewAttendance.map((e) => {
            const sanitized = sanitizeObjectOfNull(e.toJSON());
            return {
              ...sanitized,
              check_in_out_date_time: e.dataValues.check_in_out_date_time
                ? formatDateAndTimeCreateDateTime(
                  e.dataValues.check_in_out_date_time
                )
                : "",
            };
          });

        // 🔹 1️⃣ Create Attendance Map (group by date)
        const attendanceMap = {};

        if (sanitizeData && sanitizeData.length > 0) {
          sanitizeData.forEach((attendanceData) => {
            const date = attendanceData.attendanceDate;

            if (!attendanceMap[date]) attendanceMap[date] = [];

            attendanceMap[date].push({
              attendance_status: attendanceData.attendance_status || "0",
              a_application_login_id:
                attendanceData.a_application_login_id || "",
              check_in_out_date_time:
                attendanceData.check_in_out_date_time || "00-00-00 00:00",
              total_working_hour:
                attendanceData.total_working_hour || "00:00:00",
              created_date_time:
                attendanceData.created_date_time || "",
              company_masters_id:
                attendanceData.company_masters_id || 0,
              attendanceDate: date,
              attendanceTime:
                attendanceData.attendanceTime || "00:00",
              image_url: attendanceData.image_url
                ? `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/attendanceImg/${findCompanyId.company_masters_id}/${attendanceData.image_url}`
                : "",
              address: attendanceData.address || "",
              latitude: attendanceData.latitude || "",
              longitude: attendanceData.longitude || "",
            });
          });
        }

        // 🔹 2️⃣ Create Leave Date Map
        const leaveDateMap = {};

        leaveData.forEach((leave) => {

          const start = moment(leave.leave_date).startOf("day");
          const end = leave.reporting_date
            ? moment(leave.reporting_date).startOf("day")
            : start;

          const leaveTypeName =
            leaveTypes.find(l => l.id === leave.leave_type_id)?.leave_type || null;

          let current = start.clone();

          while (current.isBefore(end, "day")) {

            const formattedDate = current.format("YYYY-MM-DD");

            leaveDateMap[formattedDate] = {
              leave_type_id: leave.leave_type_id,
              leave_type: leaveTypeName,
              leave_duration: leave.leave_duration,
              hourly_leave_duration: leave.hourly_leave_duration
            };

            current.add(1, "day");
          }

        });


        // 🔹 3️⃣ Generate Full Date Range
        const fullDateRange = generateDateRange(startDate, endDate);
        let totalPresentDays = 0;
        let totalWorkingHoursInSeconds = 0;

        // 🔹 4️⃣ Build Final Attendance Data With Status
        const attendanceDataWithStatus = fullDateRange.map((date) => {
          const today = moment().format("YYYY-MM-DD");
          const dayNumber = moment(date).day(); // 0=Sunday
          const isWeekOff = weekOffArray.includes(dayNumber);

          const messages = attendanceMap[date] || [];
          const hasAttendance = messages.length > 0;
          const hasLeave =
            leaveDateMap[date] &&
            Number(leaveDateMap[date]?.leave_duration) != 4;
          let status = "-";
          let leaveTypeName = null;

          if (hasLeave) {
            status = "L";
            leaveTypeName = leaveDateMap[date]?.leave_type || null;
          }
          else if (isWeekOff) {
            status = "Week Off";
          }
          else if (hasAttendance) {
            let dayTotalSeconds = 0;

            messages.forEach(msg => {
              if (msg.total_working_hour) {
                const parts = msg.total_working_hour.split(":");
                const hours = Number(parts[0] || 0);
                const minutes = Number(parts[1] || 0);
                const seconds = Number(parts[2] || 0);

                dayTotalSeconds += (hours * 3600) + (minutes * 60) + seconds;
              }
            });

            const dayTotalHours = dayTotalSeconds / 3600;

            const isMinHoursEnabled = minPresentHoursDecimal > 0;

            if (!isMinHoursEnabled) {
              // ✅ No validation → directly present
              status = "P";
              totalPresentDays += 1;
              totalWorkingHoursInSeconds += dayTotalSeconds;
            } else {
              // ✅ Validation applied
              if (dayTotalHours >= minPresentHoursDecimal) {
                status = "P";
                totalPresentDays += 1;
                totalWorkingHoursInSeconds += dayTotalSeconds;
              } else {
                status = "A";
              }
            }
          }
          else if (date < today) {
            status = "A";
          }

          return {
            date,
            status,
            leave_type: leaveTypeName,
            messages,
          };
        });
        const totalPaidDays = totalPresentDays + companyPaidLeave;
        // Convert daily working hours to seconds
        const dailyWorkingSeconds = dailyWorkingHours * 3600;

        // Total paid seconds
        const totalPaidSeconds =
          totalWorkingHoursInSeconds +
          (companyPaidLeave * dailyWorkingSeconds);

        // HH:MM:SS
        const totalPaidHoursHHMMSS = convertToHHMMSS(totalPaidSeconds);
        const totalPaidHoursDecimal = totalPaidSeconds / 3600;


        let finalSalary = 0;

        if (salaryType === 1) {
          // Hourly based
          finalSalary = totalPaidHoursDecimal * salaryAmount;
        }
        else if (salaryType === 2) {
          // Day based
          finalSalary = totalPaidDays * salaryAmount;
        } else if (salaryType === 3) {
          const totalDaysInMonth = moment(startDate).daysInMonth();

          let weekOffCount = 0;

          fullDateRange.forEach(date => {
            const dayNumber = moment(date).day();
            if (weekOffArray.includes(dayNumber)) {
              weekOffCount++;
            }
          });

          const totalWorkingDays = totalDaysInMonth - weekOffCount;

          const perDaySalary = salaryAmount / totalWorkingDays;

          finalSalary = perDaySalary * totalPaidDays;
        }
        finalSalary = Number(finalSalary.toFixed(2));


        // 🔹 5️⃣ Return Final Response
        return {
          username,
          companyPaidLeave,
          employeePaidLeave,
          totalPaidDays,
          totalPaidHours: totalPaidHoursHHMMSS,
          finalSalary,
          attendanceData: attendanceDataWithStatus,
        };
      }

    })
  );
  const finalTeamData = teamData.filter((e) => e !== null);
  return resSuccess({
    data: { item: finalTeamData },
    ack_msg: "Team Attendance report fetched successfully",
  });
};
