import { randomUUID } from "crypto";
import * as fs from "fs";
import moment from "moment";
import * as path from "path";
import { col, Op, Sequelize } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { attendanceModel } from "../../models/hr/attendanceModel.js";
import { employeePayrollModel } from "../../models/hr/employeePayrollModel.js";
import { BACKEND_OF_SMALL_OFFICE_CRM_END_POINT, EXPORTS_LINK_EXTENDED } from "../../utils/appConstants.js";
import { exportData } from "../../utils/exporter.js";
import logger from "../../utils/logger.js";
import {
  formatDateAndTimeCreateDateTime,
  resBadRequest,
  resError,
  resSuccess,
  sanitizeObjectOfNull
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

function computeAutoOutTime(lastCheckOutDateTime, defaultDailyOutTime) {
  const lastTime = moment(lastCheckOutDateTime);
  const datePart = lastTime.format("YYYY-MM-DD");
  const defaultOut = moment(`${datePart} ${defaultDailyOutTime}`, "YYYY-MM-DD HH:mm:ss");
  if (lastTime.isAfter(defaultOut)) {
    const candidate = lastTime.clone().add(5, "seconds");
    if (candidate.format("YYYY-MM-DD") !== datePart) {
      return moment(`${datePart} 23:59:59`, "YYYY-MM-DD HH:mm:ss").format("YYYY-MM-DD HH:mm:ss");
    }
    return candidate.format("YYYY-MM-DD HH:mm:ss");
  }
  return defaultOut.format("YYYY-MM-DD HH:mm:ss");
}

export const attendanceCheck = async (req) => {
  const findCompanyId = await getCompanyByLoginId(
    req.body.a_application_login_id
  );

  let convertPath = "";
  if (req.file) {
    const profilePic = req.file.path;

    if (profilePic) {
      const directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "attendance_images",
        findCompanyId.company_masters_id.toString(),
        req.body.a_application_login_id.toString()
      );
      await fs.promises.mkdir(directoryPath, { recursive: true });
      const fileName = path.basename(profilePic);
      const destinationPath = path.join(directoryPath, fileName);
      await fs.promises.rename(profilePic, destinationPath);
      convertPath = `${req.body.a_application_login_id}/${fileName}`;
    }
  }

  const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
  try {

    const AMmodel = attendanceModel(req.tenantDB);
    const empPayrollModel = employeePayrollModel(req.tenantDB);


    const startOfDay = moment().startOf("day").format("YYYY-MM-DD HH:mm:ss");

    const employee = await empPayrollModel.findOne({
      where: {
        a_application_login_id: req.body.a_application_login_id,
        isDelete: 0,
      },
      attributes: ["compulsary_attendance", "compulsary_attendance_image", "daily_out_time"],
      raw: true,
    });

    const attendanceBody = {
      company_masters_id: findCompanyId.company_masters_id,
      attendance_status: req.body.attendance_status,
      a_application_login_id: req.body.a_application_login_id,
      check_in_out_date_time: formattedDate,
      created_date_time: formattedDate,
      image_url: convertPath,
      device_type: req.body.device_type || 1,
      latitude: req.body.latitude || "",
      longitude: req.body.longitude || "",
      address: req.body.address || "",
    };

    /* ===================== AUTO CHECK-OUT ===================== */
    const lastAttendance = await AMmodel.findOne({
      where: {
        a_application_login_id: req.body.a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
        check_in_out_date_time: { [Op.lt]: startOfDay },
      },
      raw: true,
      attributes: ["attendance_status", "check_in_out_date_time"],
      order: [["check_in_out_date_time", "DESC"]],
    });

    if (lastAttendance && lastAttendance.attendance_status === 1) {
      const dailyOutTime =
        employee?.daily_out_time && employee?.daily_out_time !== "00:00:00"
          ? employee?.daily_out_time
          : "20:00:00";

      const autoOutTime = computeAutoOutTime(
        lastAttendance.check_in_out_date_time,
        dailyOutTime
      );

      const inTime = moment(lastAttendance.check_in_out_date_time);
      const outTime = moment(autoOutTime);
      const duration = moment.duration(outTime.diff(inTime));

      const hours = String(Math.floor(duration.asHours())).padStart(2, "0");
      const minutes = String(duration.minutes()).padStart(2, "0");
      const seconds = String(duration.seconds()).padStart(2, "0");

      await AMmodel.create({
        a_application_login_id: req.body.a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        attendance_status: 2,
        attendance_entry_flag: 2,
        check_in_out_date_time: autoOutTime,
        isDelete: 0,
        created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
        image_url: "",
        total_working_hour: `${hours}:${minutes}:${seconds}`,
      });

      return resSuccess({
        data: attendanceBody,
        ack_msg: "Last Pending Check Out successfully, Check In Now For Today",
      });
    }

    const verifyAttendance = await AMmodel.findOne({
      where: {
        isDelete: 0, // use integer, not string
        a_application_login_id: attendanceBody.a_application_login_id,
        company_masters_id: attendanceBody.company_masters_id,
      },
      order: [["check_in_out_date_time", "DESC"]],
    });

    if (
      verifyAttendance?.dataValues?.attendance_status ==
      attendanceBody.attendance_status
    ) {
      return resError({
        ack_msg: "You already checked in or out.",
        developer_msg: "You already checked in or out.",
      });
    }


    if (attendanceBody.attendance_status === 2) {
      const lastCheckIn = await AMmodel.findOne({
        where: {
          isDelete: "0",
          a_application_login_id: attendanceBody.a_application_login_id,
          company_masters_id: attendanceBody.company_masters_id,
          attendance_status: 1, // Only IN
        },
        order: [["check_in_out_date_time", "DESC"]],
      });

      if (lastCheckIn) {
        const inTimeRaw = lastCheckIn.check_in_out_date_time;
        const outTimeRaw = attendanceBody.check_in_out_date_time;

        const inTime = moment(inTimeRaw, "YYYY-MM-DD HH:mm:ss");
        const outTime = moment(outTimeRaw, "YYYY-MM-DD HH:mm:ss");

        if (!inTime.isValid() || !outTime.isValid()) {
          logger.error("Invalid datetime format");
        }

        const diffMs = outTime.diff(inTime);

        const duration = moment.duration(diffMs);
        const hours = String(Math.floor(duration.asHours())).padStart(2, "0");
        const minutes = String(duration.minutes()).padStart(2, "0");
        const seconds = String(duration.seconds()).padStart(2, "0");

        attendanceBody.total_working_hour = `${hours}:${minutes}:${seconds}`;
      }
    }

    const attendanceHistory = await AMmodel.create(attendanceBody);


    if (attendanceHistory) {
      // notification start

      /* // check Permission
      const notictionpermission = await loginModel.findOne({
        where: {
          isDelete: 0,
          id: req.body.a_application_login_id,
        },
        attributes: ["team_member_attendance", "username"],
        raw: true, // already being used
      });

      const username = notictionpermission.username;

      if (notictionpermission) {
        const ownerTokenData = await companyVsApplicationLoginModel.findAll({
          where: {
            isDelete: 0,
            company_masters_id: findCompanyId.company_masters_id,
            company_flag: 1
          },
          attributes: ["a_application_login_id"],

        });


        // Get tokens for each owner a_application_login_id
        const allLoginIds = ownerTokenData.map(
          (item) => item.a_application_login_id
        );

        //
        const findTokens = await loginModel.findAll({
          where: {
            id: allLoginIds,
            isDelete: 0,
          },
          attributes: [
            "android_refresh_token",
            "web_refresh_token",
            "ios_refresh_token",
          ],
        });

        const tokens = findTokens
          .flatMap((tokenObj) => {
            const {
              android_refresh_token,
              web_refresh_token,
              ios_refresh_token,
            } = tokenObj.dataValues;
            return [
              android_refresh_token,
              web_refresh_token,
              ios_refresh_token,
            ];
          })
          .filter((token) => token && token.trim() !== "");

        if (tokens.length > 0) {
          try {
            await sendMultipleNotification({
              deviceTokens: tokens,
              title: `${username} has successfully ${attendanceBody.attendance_status == 1 ? 'checked in' : 'checked out'}`,
              // body: remark || "A new visit has been created",
              data: {
                page_id: PAGE_ID.ATTENDANCE,
              },
            });
          } catch (notificationError) {
            logger.error(
              "Notification failed (non-critical):",
              notificationError.message
            );
          }
        } else {
          logger.info("No device tokens found for owners.");
        }
      } else {
        logger.info("Permission denied: team_member_attendance	 is not 1");
      }

      // notification End */

      if (attendanceBody.attendance_status == 1) {
        return resSuccess({
          data: attendanceBody,
          ack_msg: "Attendance Check In successfully",
        });
      } else if (attendanceBody.attendance_status == 2) {
        return resSuccess({
          data: attendanceBody,
          ack_msg: "Attendance Check Out successfully",
        });
      }
    } else {
      return resError({
        ack_msg: "something went wrong",
        developer_msg: "Data not found",
      });
    }
  } catch (error) {
    return resBadRequest({
      developer_msg: `Error ${error}`,
      ack_msg: "Error attendance handle",
    });
  }
};

const formatTime = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
};

// Function to calculate total working hours for a group
const calculateTotalWorkingHours = (attendanceHistory) => {
  let totalSeconds = 0;
  attendanceHistory.forEach((item) => {
    item.messages.forEach((e) => {
      const timeStr = e.total_working_hour;
      if (timeStr && typeof timeStr === "string") {
        const [hours, minutes, seconds] = timeStr.split(":").map(Number);
        if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
          totalSeconds += hours * 3600 + minutes * 60 + seconds;
        }
      }
    });
  });
  return formatTime(totalSeconds);
};

// Helper function to add minutes to a TIME string (HH:mm:ss)
function addMinutesToTime(timeStr, minutes) {
  if (!timeStr) return null;

  const [hours, mins, secs] = timeStr.split(':').map(Number);
  let totalMinutes = hours * 60 + mins + minutes;

  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;

  return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}:00`;
}

// Compare two time strings (HH:mm:ss)
function compareTime(time1, time2) {
  return time1.localeCompare(time2);
}
function subtractMinutesFromTime(timeStr, minutes) {
  if (!timeStr) return null;

  const [hours, mins, secs] = timeStr.split(":").map(Number);

  let totalMinutes = hours * 60 + mins - minutes;

  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }

  const newHours = Math.floor(totalMinutes / 60);
  const newMins = totalMinutes % 60;

  return `${newHours.toString().padStart(2, "0")}:${newMins
    .toString()
    .padStart(2, "0")}:00`;
}
// Get IN Status with 15 minutes grace period
function getInStatus(checkInTime, dailyInTime, gracePeriod = 15) {
  if (!checkInTime || !dailyInTime) return "Unknown";

  const graceTime = addMinutesToTime(
    dailyInTime,
    Number(gracePeriod || 0)
  );

  if (compareTime(checkInTime, dailyInTime) < 0) {
    return "Early In";
  }

  if (compareTime(checkInTime, graceTime) <= 0) {
    return "On Time";
  }

  return "Late In";
}

// Get OUT Status with 15 minutes grace period
function getOutStatus(checkOutTime, dailyOutTime, gracePeriod = 15) {
  if (!checkOutTime || !dailyOutTime) return "Unknown";

  const earlyOutLimit = subtractMinutesFromTime(
    dailyOutTime,
    Number(gracePeriod || 0)
  );

  const overTimeLimit = addMinutesToTime(
    dailyOutTime,
    Number(gracePeriod || 0)
  );

  if (compareTime(checkOutTime, earlyOutLimit) < 0) {
    return "Early Out";
  }

  if (compareTime(checkOutTime, overTimeLimit) > 0) {
    return "Over Time";
  }

  return "On Time";
}


//request flag 1 ===> check in/out ma last status get karva
//request flag 2 ===> data get karva     My Team --> Attendance History

export const attendanceView = async (req) => {
  try {
    const findCompanyId = await getCompanyByLoginId(
      req.body.a_application_login_id
    );

    const AMmodel = attendanceModel(req.tenantDB);
    const empPayrollModel = employeePayrollModel(req.tenantDB);

    if (req.body.request_flag === 1) {
      // Keep your existing logic for single record
      const viewAttendance = await AMmodel.findOne({
        where: {
          company_masters_id: findCompanyId.company_masters_id,
          a_application_login_id: req.body.a_application_login_id,
          isDelete: "0",
        },
        order: [["check_in_out_date_time", "DESC"]],
        attributes: ["attendance_status"],
      });

      return viewAttendance
        ? resSuccess({ ack_msg: "Attendance view", data: viewAttendance.attendance_status })
        : resError({ ack_msg: "something went wrong", developer_msg: "Data not found" });
    }

    // ====================== request_flag === 2 (Date Range) ======================
    const start = moment(req.body.selectedDates[0]).format("YYYY-MM-DD");
    const end = moment(req.body.selectedDates[1]).format("YYYY-MM-DD");

    // 1. Fetch Employee's Shift Timings (daily_in_time & daily_out_time)
    const employee = await empPayrollModel.findOne({
      where: {
        a_application_login_id: req.body.a_application_login_id,
        isDelete: 0,
      },
      attributes: ["daily_in_time", "daily_out_time", "daily_working_hours", "grace_period"],
      raw: true,
    });

    if (!employee) {
      return resError({
        ack_msg: "Employee not found",
        developer_msg: "Login record not found",
      });
    }
    // const employee = await loginModel.findOne({
    //       where: {
    //         id: req.body.a_application_login_id,
    //         isDelete: 0,
    //       },
    //       attributes: ["daily_in_time", "daily_out_time", "daily_working_hours"],
    //       raw: true,
    //     });

    //     if (!employee) {
    //       return resError({
    //         ack_msg: "Employee not found",
    //         developer_msg: "Login record not found",
    //       });
    //     }
    const gracePeriod = Number(employee.grace_period || 15);
    const dailyInTime = employee.daily_in_time || "10:00:00";   // fallback if null
    const dailyOutTime = employee.daily_out_time || "20:00:00"; // fallback if null

    // 2. Fetch all attendance records
    const viewAttendance = await AMmodel.findAll({
      where: {
        a_application_login_id: req.body.a_application_login_id,
        isDelete: "0",
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("check_in_out_date_time")),
            { [Op.gte]: start, [Op.lte]: end }
          ),
        ],
      },
      attributes: {
        include: [
          [Sequelize.fn("DATE", col("check_in_out_date_time")), "attendanceDate"],
          [Sequelize.fn("TIME", col("check_in_out_date_time")), "attendanceTime"],
        ],
      },
      order: [["check_in_out_date_time", "ASC"]],
      raw: true,
    });

    if (!viewAttendance || viewAttendance.length === 0) {
      return resError({
        ack_msg: "No attendance data found",
        developer_msg: "Data not found in selected date range",
      });
    }

    // 3. Get team members for updated_by name
    const activeTeamList = await loginModel.findAll({
      where: {
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT a_application_login_id 
            FROM company_vs_application_logins 
            WHERE isDelete=0 AND company_masters_id = '${findCompanyId.company_masters_id}'
          )`),
        },
        isDelete: 0,
      },
      attributes: ["username", "id"],
      raw: true,
    });

    const activeTeamMap = new Map(
      activeTeamList.map((user) => [Number(user.id), user.username])
    );

    // 4. Group by date and process first/last entry
    const groupedByDate = {};

    viewAttendance.forEach((record) => {
      const date = record.attendanceDate;

      if (!groupedByDate[date]) {
        groupedByDate[date] = [];
      }

      groupedByDate[date].push({
        ...record,
        check_in_out_date_time: record.check_in_out_date_time
          ? formatDateAndTimeCreateDateTime(record.check_in_out_date_time)
          : "",
        updated_by_name: record.updated_by
          ? activeTeamMap.get(Number(record.updated_by)) || null
          : null,
        image_url: record.image_url
          ? `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/attendanceImg/${findCompanyId.company_masters_id}/${record.image_url}`
          : "",
      });
    });

    // 5. Final result with proper status
    const result = [];

    for (const [date, records] of Object.entries(groupedByDate)) {
      // Sort records by time (in case order is not guaranteed)
      records.sort((a, b) => a.attendanceTime.localeCompare(b.attendanceTime));

      const firstEntry = records[0];
      const lastEntry = records[records.length - 1];

      // Calculate IN and OUT status
      const inStatus = getInStatus(
        firstEntry.attendanceTime,
        dailyInTime,
        gracePeriod
      );

      const outStatus = getOutStatus(
        lastEntry.attendanceTime,
        dailyOutTime,
        gracePeriod
      );

      const groupObj = {
        date: date,
        messages: records,
        totalWorkingHours: calculateTotalWorkingHours([{ messages: records }]),
        first_check_in: firstEntry.attendanceTime,
        last_check_out: lastEntry.attendanceTime,
        in_status: inStatus,
        out_status: outStatus,
        daily_in_time: dailyInTime,
        daily_out_time: dailyOutTime,
      };

      result.push(groupObj);
    }

    return resSuccess({
      ack_msg: "Attendance view",
      data: { item: result },
    });
  } catch (error) {
    console.error("Attendance View Error:", error);
    return resBadRequest({
      developer_msg: `Error: ${error.message}`,
      ack_msg: "Error occurred while fetching attendance",
    });
  }
};

export const attendanceViewByDate = async (req) => {
  try {
    const { a_application_login_id, date } = req.body;

    if (!a_application_login_id || !date) {
      return resError({
        ack_msg: "Date and application login id are required",
      });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const AMmodel = attendanceModel(req.tenantDB);

    // 1️⃣ Fetch attendance for the given date
    const attendanceList = await AMmodel.findAll({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        a_application_login_id,
        isDelete: "0",
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("check_in_out_date_time")),
            date // yyyy-MM-dd
          ),
        ],
      },
      attributes: {
        include: [
          [
            Sequelize.fn("DATE", Sequelize.col("check_in_out_date_time")),
            "attendanceDate",
          ],
          [
            Sequelize.fn("TIME", Sequelize.col("check_in_out_date_time")),
            "attendanceTime",
          ],
        ],
      },
      order: [["check_in_out_date_time", "ASC"]],
    });

    if (!attendanceList || attendanceList.length === 0) {
      return resSuccess({
        ack_msg: "No attendance found for this date",
        data: [],
      });
    }

    // 2️⃣ Sanitize data
    const sanitizeData = attendanceList.map((e) => {
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

    // 3️⃣ Collect updated_by IDs
    const updatedByIds = [
      ...new Set(
        sanitizeData
          .filter((d) => d.updated_by)
          .map((d) => Number(d.updated_by))
      ),
    ];

    // 4️⃣ Fetch usernames
    let updatedByMap = new Map();

    if (updatedByIds.length > 0) {
      const users = await loginModel.findAll({
        where: {
          id: { [Op.in]: updatedByIds },
          isDelete: 0,
        },
        attributes: ["id", "username"],
        raw: true,
      });

      updatedByMap = new Map(users.map((u) => [u.id, u.username]));
    }

    // 5️⃣ Attach updated_by_name
    const finalData = sanitizeData.map((item) => {
      const dateTime = moment(
        item.check_in_out_date_time,
        "DD-MM-YYYY HH:mm:ss"
      );

      return {
        ...item,
        attendanceDate: dateTime.isValid()
          ? dateTime.format("YYYY-MM-DD")
          : null,
        attendanceTime: dateTime.isValid()
          ? dateTime.format("HH:mm:ss")
          : null,
        updated_by_name: item.updated_by
          ? updatedByMap.get(Number(item.updated_by)) || ""
          : "",
      };
    });

    // 6️⃣ Calculate total working hours for this date
    const totalWorkingHours = calculateTotalWorkingHours([
      {
        messages: finalData,
      },
    ]);


    return resSuccess({
      ack_msg: "Attendance fetched successfully",
      data: {
        item: finalData,
        totalWorkingHours,
      },
    });
  } catch (error) {
    return resBadRequest({
      developer_msg: `Error ${error}`,
      ack_msg: "Error",
    });
  }
};

export const attendanceDelete = async (req) => {
  try {
    const attendanceId = req.body.attendance_id;
    const aApplicationLoginId = req.body.a_application_login_id;

    if (!attendanceId || !aApplicationLoginId) {
      return resBadRequest({
        ack_msg: "Missing required parameters",
        developer_msg: "attendance_id and a_application_login_id are required",
      });
    }

    const findCompanyId = await getCompanyByLoginId(aApplicationLoginId);
    const AMmodel = attendanceModel(req.tenantDB);

    // Find the attendance record to delete
    const attendanceToDelete = await AMmodel.findOne({
      where: {
        id: attendanceId,
        a_application_login_id: aApplicationLoginId,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
    });

    if (!attendanceToDelete) {
      return resError({
        ack_msg: "Attendance record not found",
        developer_msg: "No matching attendance record",
      });
    }

    // Soft delete the record
    const deletedAttendence = await AMmodel.update(
      { isDelete: 1, updated_by: aApplicationLoginId },
      {
        where: { id: attendanceId },
      }
    );

    if (!deletedAttendence) {
      return resError({
        ack_msg: "Attendance record not Deleted",
        developer_msg: "No attendance Deleted",
      });
    }
    // Now, recalculate total_working_hour for all remaining check-outs for this user
    const allAttendances = await AMmodel.findAll({
      where: {
        a_application_login_id: aApplicationLoginId,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
      order: [["check_in_out_date_time", "ASC"]],
    });

    let lastCheckIn = null;

    for (const attendance of allAttendances) {
      if (attendance.attendance_status === 1) {
        // Check-in: update lastCheckIn
        lastCheckIn = attendance;
      } else if (attendance.attendance_status === 2) {
        // Check-out: calculate duration if there's a lastCheckIn
        if (lastCheckIn) {
          const inTime = moment(lastCheckIn.check_in_out_date_time, "YYYY-MM-DD HH:mm:ss");
          const outTime = moment(attendance.check_in_out_date_time, "YYYY-MM-DD HH:mm:ss");

          if (inTime.isValid() && outTime.isValid()) {
            const diffMs = outTime.diff(inTime);
            const duration = moment.duration(diffMs);
            const hours = String(Math.floor(duration.asHours())).padStart(2, "0");
            const minutes = String(duration.minutes()).padStart(2, "0");
            const seconds = String(duration.seconds()).padStart(2, "0");
            const newTotalWorkingHour = `${hours}:${minutes}:${seconds}`;

            // Update if different
            if (newTotalWorkingHour !== attendance.total_working_hour) {
              await AMmodel.update(
                { total_working_hour: newTotalWorkingHour },
                { where: { id: attendance.id } }
              );
            }
          }
        } else {
          // No matching check-in: set to '00:00:00'
          if (attendance.total_working_hour !== '00:00:00') {
            await AMmodel.update(
              { total_working_hour: '00:00:00' },
              { where: { id: attendance.id } }
            );
          }
        }
        // Reset lastCheckIn after check-out
        lastCheckIn = null;
      }
    }

    // Optionally, send notification or log the deletion

    return resSuccess({
      ack_msg: "Attendance record deleted successfully",
      developer_msg: "Working hours updated where necessary",
    });
  } catch (error) {
    return resBadRequest({
      developer_msg: `Error: ${error.message}`,
      ack_msg: "Error deleting attendance",
    });
  }
};

export const attendanceUpdate = async (req) => {
  try {
    const {
      attendance_id,              // required
      a_application_login_id,     // required
      check_in_out_date_time,     // new datetime (optional)
      attendance_status,          // 1 or 2 (optional)
      remark,
      updated_by
    } = req.body;

    if (!attendance_id || !a_application_login_id) {
      return resBadRequest({
        ack_msg: "Missing required parameters",
        developer_msg: "attendance_id and a_application_login_id are required",
      });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const AMmodel = attendanceModel(req.tenantDB);

    // 1. Find the record to update
    const recordToUpdate = await AMmodel.findOne({
      where: {
        id: attendance_id,
        a_application_login_id: a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
    });

    if (!recordToUpdate) {
      return resError({
        ack_msg: "Attendance record not found",
        developer_msg: "No matching record",
      });
    }

    // 2. Prepare update payload (only fields that are provided)
    const updateData = {
      "updated_by": updated_by
    };

    if (check_in_out_date_time !== undefined) {
      updateData.check_in_out_date_time = check_in_out_date_time;
    }

    if (attendance_status !== undefined) {
      if (![1, 2].includes(Number(attendance_status))) {
        return resBadRequest({ ack_msg: "Invalid attendance_status (1 or 2 only)" });
      }
      updateData.attendance_status = Number(attendance_status);
    }

    if (remark !== undefined) {
      updateData.remark = remark;
    }

    if (Object.keys(updateData).length === 0) {
      return resBadRequest({ ack_msg: "No fields to update" });
    }

    // 3. Perform the update
    const recordUpdated = await AMmodel.update(updateData, {
      where: { id: attendance_id },
    });

    if (!recordUpdated) {
      return resError({
        ack_msg: "Attendance record not Updated",
        developer_msg: "No matching record",
      });
    }

    // 4. Re-calculate total_working_hour for ALL records of this user (same as delete)
    const allAttendances = await AMmodel.findAll({
      where: {
        a_application_login_id: a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
      order: [["check_in_out_date_time", "ASC"]],
    });

    let lastCheckIn = null;

    for (const attendance of allAttendances) {
      if (attendance.attendance_status === 1) {
        lastCheckIn = attendance;
      } else if (attendance.attendance_status === 2) {
        if (lastCheckIn) {
          const inTime = moment(lastCheckIn.check_in_out_date_time, "YYYY-MM-DD HH:mm:ss");
          const outTime = moment(attendance.check_in_out_date_time, "YYYY-MM-DD HH:mm:ss");

          if (inTime.isValid() && outTime.isValid()) {
            const diffMs = outTime.diff(inTime);
            const duration = moment.duration(diffMs);
            const hours = String(Math.floor(duration.asHours())).padStart(2, "0");
            const minutes = String(duration.minutes()).padStart(2, "0");
            const seconds = String(duration.seconds()).padStart(2, "0");

            const newTotal = `${hours}:${minutes}:${seconds}`;

            // Only update if changed → saves unnecessary writes
            if (newTotal !== attendance.total_working_hour) {
              await AMmodel.update(
                { total_working_hour: newTotal },
                { where: { id: attendance.id } }
              );
            }
          }
        } else {
          // Orphan OUT → set to 00:00:00
          if (attendance.total_working_hour !== "00:00:00") {
            await AMmodel.update(
              { total_working_hour: "00:00:00" },
              { where: { id: attendance.id } }
            );
          }
        }
        lastCheckIn = null; // reset after OUT
      }
    }

    const updatedRecord = await AMmodel.findByPk(attendance_id);

    return resSuccess({
      ack_msg: "Attendance updated successfully",
      data: updatedRecord,
      developer_msg: "Working hours recalculated",
    });
  } catch (error) {
    logger.error("Attendance update error:", error);
    return resBadRequest({
      developer_msg: `Error: ${error.message}`,
      ack_msg: "Failed to update attendance",
    });
  }
};

export const calculateWorkingHours = (inDateTime, outDateTime) => {
  const inTime = moment(inDateTime, "YYYY-MM-DD HH:mm:ss");
  const outTime = moment(outDateTime, "YYYY-MM-DD HH:mm:ss");

  if (!inTime.isValid() || !outTime.isValid()) {
    return "00:00:00";
  }

  const diffMs = outTime.diff(inTime);
  if (diffMs <= 0) {
    return "00:00:00"; // negative duration → invalid
  }

  const duration = moment.duration(diffMs);
  const hours = String(Math.floor(duration.asHours())).padStart(2, "0");
  const minutes = String(duration.minutes()).padStart(2, "0");
  const seconds = String(duration.seconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
};

export const createManualAttendance = async (req, res) => {
  try {
    const {
      a_application_login_id,
      attendance_status,          // 1 = IN, 2 = OUT
      check_in_out_date_time,     // "YYYY-MM-DD HH:mm:ss"
      remark,
      updated_by
    } = req.body;

    // 1. Basic validation
    if (!a_application_login_id || !attendance_status || !check_in_out_date_time) {
      return resBadRequest({
        ack_msg: "Missing required fields",
        developer_msg: "a_application_login_id, attendance_status, check_in_out_date_time are required",
      });
    }

    if (![1, 2].includes(Number(attendance_status))) {
      return resBadRequest({
        ack_msg: "Invalid attendance_status",
        developer_msg: "attendance_status must be 1 (IN) or 2 (OUT)",
      });
    }

    // Validate datetime format
    if (!moment(check_in_out_date_time, "YYYY-MM-DD HH:mm:ss", true).isValid()) {
      return resBadRequest({
        ack_msg: "Invalid date/time format",
        developer_msg: "check_in_out_date_time must be in YYYY-MM-DD HH:mm:ss format",
      });
    }

    const companyInfo = await getCompanyByLoginId(a_application_login_id);
    if (!companyInfo?.company_masters_id) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: "Invalid a_application_login_id",
      });
    }

    const AMmodel = attendanceModel(req.tenantDB);

    let total_working_hour = "00:00:00";

    // If it's a check-out (status = 2), try to find the last check-in and calculate duration
    if (Number(attendance_status) === 2) {
      const outDate = moment(check_in_out_date_time).format("YYYY-MM-DD");
      const lastCheckIn = await AMmodel.findOne({
        where: {
          a_application_login_id,
          company_masters_id: companyInfo.company_masters_id,
          attendance_status: 1, // IN
          isDelete: 0,
          [Op.and]: [
            Sequelize.where(
              Sequelize.fn("DATE", Sequelize.col("check_in_out_date_time")),
              outDate
            ),
          ],
        },
        order: [["check_in_out_date_time", "DESC"]],
      });

      if (lastCheckIn) {
        total_working_hour = calculateWorkingHours(
          lastCheckIn.check_in_out_date_time,
          check_in_out_date_time
        );
      }
      else {
        total_working_hour = "00:00:00";
      }
    }

    // 2. Create the manual attendance record
    const newAttendance = await AMmodel.create({
      company_masters_id: companyInfo.company_masters_id,
      a_application_login_id,
      attendance_status: Number(attendance_status),
      check_in_out_date_time,
      total_working_hour,
      created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
      attendance_entry_flag: 3,           // Manual entry
      image_url: "",                      // No image for manual entry (or null if allowed)
      isDelete: 0,
      isActive: 1,
      remark: remark || "",
      updated_by
    });

    return resSuccess({
      ack_msg: "Manual attendence created successfully",
      data: newAttendance,
      developer_msg: "Manual attendance record added successfully",
    });
  } catch (error) {
    logger.error("Manual attendance creation failed:", error);
    return resBadRequest({
      ack_msg: "Failed to create manual attendance",
      developer_msg: error.message || "Server error",
    });
  }
};

export const generateAttendanceSampleSheet = async (req, res) => {
  try {
    const { a_application_login_id } = req.body;

    const companyDetail = await getCompanyByLoginId(a_application_login_id);

    const fileName = `sample_attendance_sheet_${randomUUID()}`;
    const format = "xlsx";

    const outputDir = `media-folder/exports/attendance/${companyDetail.company_masters_id}`;
    const uploadDir = path.resolve(process.cwd(), outputDir);

    // Create directory if not exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    /** Default columns with demo values **/
    const excelColumnDefineArray = {
      employee_id: "EMP001",
      employee_name: "John Doe",
      attendance_date: "2026-01-01",
      attendance_time: "09:30:00",
      status: "1",
    };

    const data = [excelColumnDefineArray];

    /** Required column colors (Red background) **/
    const requiredColumns = {
      employee_id: "FFFF0000",
      attendance_date: "FFFF0000",
      attendance_time: "FFFF0000",
      status: "FFFF0000",
    };

    /** Export Excel **/
    const savedPath = await exportData(data, {
      format,
      fileName,
      columns: null,
      headers: null,
      autoDownload: false,
      outputDir: uploadDir,
      colorColumns: requiredColumns,
    });

    const fileUrl = `${EXPORTS_LINK_EXTENDED}attendance/${companyDetail.company_masters_id}/${savedPath.file_name}`;

    return resSuccess({
      data: { fileUrl, fileName: savedPath.file_name },
    });

  } catch (error) {
    console.error("generateAttendanceSampleSheet Error:", error);

    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
};