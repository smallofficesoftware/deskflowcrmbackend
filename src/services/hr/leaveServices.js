import fs from "fs-extra";
import moment from "moment";
import path from "path";
import Sequelize, { col, fn, Op, where } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { leavesModel } from "../../models/hr/leavesModel.js";
import { employeePayrollModel } from "../../models/hr/employeePayrollModel.js";
import { compensationAdjustmentModel } from "../../models/hr/compensationAdjustmentModel.js";
import { LEAVE_IMG_LINK_EXTENDED } from "../../utils/appConstants.js";
import {
    formatDateAndTimeCreateDateTime,
    resBadRequest,
    resError,
    resSuccess,
    sanitizeObjectOfNull,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";

export const getAllLeaves = async (req) => {
    try {
        let { ul, ll, a_application_login_id, created_date_time, request_flag, checked_id, searchTerm } = req.body;


        const leaveModel = leavesModel(req.tenantDB);
        const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);



        const companyFlagData = await companyVsApplicationLoginModel.findOne({
            where: {
                [Sequelize.Op.or]: [
                    a_application_login_id && { a_application_login_id },
                    checked_id && { a_application_login_id: checked_id },
                ].filter(Boolean),
            },
            attributes: ["company_flag"],
        });


        const companyFlag = companyFlagData ? companyFlagData.company_flag : null;

        // 🔹 OLD company logic removed completely

        // --------------------------------------------
        // WHERE CLAUSE
        // --------------------------------------------
        let whereClause = {
            [Op.or]: [{ a_application_login_id }],
            isDelete: "0"
        };

        if (searchTerm && searchTerm.trim() !== "") {
            const searchValue = `%${searchTerm.trim()}%`;

            whereClause[Op.or] = [
                { remark: { [Op.like]: searchValue } },
                { status_remark: { [Op.like]: searchValue } }
            ];
        }

        if (request_flag == 3) {
            whereClause = {
                a_application_login_id,
                [Op.or]: [
                    where(fn("DATE", col("created_date_time")), created_date_time),
                ],
                isDelete: "0",
            };
        }

        if (request_flag == 1) {

            if (companyFlag === 1) {
                whereClause = {
                    isDelete: "0",
                    company_masters_id: findCompanyId.company_masters_id
                };
            }
            else {
                whereClause = {
                    a_application_login_id,
                    isDelete: "0"
                };
            }
        }

        // --------------------------------------------
        // FETCH Leave LIST
        // --------------------------------------------
        const leaveLists = await leaveModel.findAll({
            where: whereClause,
            order: [["id", "DESC"]],
            attributes: {
                include: [
                    [
                        Sequelize.literal(
                            `(SELECT leave_type FROM leave_type_masters WHERE leave_type_masters.id = leaves.leave_type_id AND leave_type_masters.isDelete = 0 LIMIT 1)`
                        ),
                        "leave_type",
                    ],
                    [
                        Sequelize.literal(
                            `(SELECT color FROM leave_type_masters WHERE leave_type_masters.id = leaves.leave_type_id AND leave_type_masters.isDelete = 0 LIMIT 1)`
                        ),
                        "color",
                    ],
                ],
            },
        });

        if (!leaveLists) {
            return resError({
                ack_msg: "No Leave Data",
                developer_msg: "Data not found",
            });
        }

        // ---------------------------------------------------
        // MAP DATA + ADD created_by_username USING loginModel
        // ---------------------------------------------------
        const sanitizedContacts = await Promise.all(
            leaveLists.map(async (leaveItem) => {
                const sanitized = sanitizeObjectOfNull(leaveItem.toJSON());
                let leave_hours = "";
                let leave_minutes = "";

                if (sanitized.hourly_leave_duration && sanitized.leave_duration == 4) {
                    const [hours, minutes] = sanitized.hourly_leave_duration.split(':');
                    leave_hours = hours ? parseInt(hours).toString() : "0";
                    leave_minutes = minutes ? parseInt(minutes).toString() : "0";
                }

                // 🔹 New logic: Find username of created_by
                let created_by_username = "";
                if (sanitized.created_by) {
                    const userData = await loginModel.findOne({
                        where: { id: sanitized.created_by },
                        attributes: ["username"]
                    });

                    created_by_username = userData ? userData.username : "";
                }
                return {
                    ...sanitized,
                    attachment: sanitized.attachment
                        ? `${LEAVE_IMG_LINK_EXTENDED}/${sanitized.attachment}`
                        : null,
                    created_date_time: sanitized.created_date_time
                        ? formatDateAndTimeCreateDateTime(sanitized.created_date_time)
                        : "",
                    companyFlag,
                    created_by_username,
                    leave_hours,
                    leave_minutes,
                };
            })
        );

        return resSuccess({
            data: { item: sanitizedContacts },
        });
    } catch (error) {
        console.log(error);
        return resBadRequest({ ack: 0, developer_msg: error.message });
    }
};

async function syncHourlyLeaveCompensationCredit(tenantDB, companyMastersId, aApplicationLoginId, leaveDate, hourlyLeaveDurationStr) {
    try {
        if (!aApplicationLoginId || !leaveDate || !hourlyLeaveDurationStr || hourlyLeaveDurationStr === "00:00") return;

        const payrollModel = employeePayrollModel(tenantDB);
        const compModel = compensationAdjustmentModel(tenantDB);

        const payroll = await payrollModel.findOne({
            where: { a_application_login_id: aApplicationLoginId, isDelete: 0 }
        });

        if (!payroll || !payroll.hourly_leave_allowed_hours || String(payroll.hourly_leave_allowed_hours) === "0") {
            return;
        }

        const allowedMins = timeStrToMinutes(String(payroll.hourly_leave_allowed_hours));
        if (allowedMins <= 0) return;

        const dateObj = moment(leaveDate, "YYYY-MM-DD");
        const monthStart = dateObj.clone().startOf("month").format("YYYY-MM-DD");
        const monthEnd = dateObj.clone().endOf("month").format("YYYY-MM-DD");

        const existingCompList = await compModel.findAll({
            where: {
                a_application_login_id: aApplicationLoginId,
                type_id: 98,
                apply_date: { [Op.between]: [monthStart, monthEnd] },
                isDelete: 0
            }
        });

        let alreadyCreditedMins = 0;
        for (const row of existingCompList) {
            if (row.apply_date !== dateObj.format("YYYY-MM-DD")) {
                alreadyCreditedMins += Math.round((Number(row.hours) || 0) * 60);
            }
        }

        const remainingAllowanceMins = Math.max(0, allowedMins - alreadyCreditedMins);
        const todayLeaveMins = timeStrToMinutes(hourlyLeaveDurationStr);
        const creditMins = Math.min(todayLeaveMins, remainingAllowanceMins);
        const creditHrs = Math.round((creditMins / 60) * 100) / 100;

        if (creditHrs > 0) {
            const todayStr = dateObj.format("YYYY-MM-DD");
            const existingTodayComp = await compModel.findOne({
                where: {
                    a_application_login_id: aApplicationLoginId,
                    type_id: 98,
                    apply_date: todayStr,
                    isDelete: 0
                }
            });

            if (existingTodayComp) {
                await compModel.update(
                    { hours: creditHrs, remark: `Hourly Leave Free Credit (${creditHrs} hrs)` },
                    { where: { id: existingTodayComp.id } }
                );
            } else {
                await compModel.create({
                    company_masters_id: companyMastersId,
                    a_application_login_id: aApplicationLoginId,
                    employee_id: payroll.employee_id || 0,
                    apply_date: todayStr,
                    adjustment_type: 1, // 1: Credit
                    hours: creditHrs,
                    amount: 0,
                    type_id: 98,
                    remark: `Hourly Leave Free Credit (${creditHrs} hrs)`
                });
            }
        }
    } catch (err) {
        console.error("syncHourlyLeaveCompensationCredit error:", err);
    }
}

function timeStrToMinutes(str) {
    if (!str) return 0;
    if (typeof str === "number") return Math.round(str * 60);
    const parts = String(str).trim().split(":");
    const hrs = parseInt(parts[0], 10) || 0;
    const mins = parseInt(parts[1], 10) || 0;
    return hrs * 60 + mins;
}


export const leaveCreate = async (req) => {
    const currentDate = new Date();
    const formattedDate = moment(currentDate).format("YYYY-MM-DD HH:mm:ss");
    try {
        const {
            leave_type_id,
            leave_duration,
            remark,
            leave_status,
            leave_date,
            reporting_date,
            a_application_login_id,
            created_by,
            leave_hours,
            leave_minutes,
        } = req.body || {};

        const attachment = req.file;
        const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);
        const leaveModel = leavesModel(req.tenantDB);

        if (!findCompanyId) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "Company not found for the given login ID",
            });
        }
        let hourly_leave_duration = "00:00";

        if (leave_duration == 4) {  // Hourly Leave
            const hours = parseInt(leave_hours) || 0;
            const minutes = parseInt(leave_minutes) || 0;

            // Format as HH:MM with leading zeros
            hourly_leave_duration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
        let directoryPath;
        let convertPath = "";
        let mediaName = "";
        if (attachment) {
            directoryPath = path.join(
                process.cwd(),
                "media-folder",
                "leave-images",
                findCompanyId.company_masters_id.toString()
            );

            await fs.mkdirp(directoryPath);
            const filePath = attachment.path;
            const fileName = path.basename(filePath);
            const destinationPath = path.join(directoryPath, fileName);

            await fs.move(filePath, destinationPath);

            convertPath =
                findCompanyId.company_masters_id.toString() + "/" + fileName;
            mediaName = attachment.originalname || fileName;
        }


        const newLeaveData = await leaveModel.create({
            leave_type_id: leave_type_id,
            leave_duration: leave_duration,
            remark: remark,
            leave_status: leave_status,
            leave_date: leave_date,
            reporting_date: reporting_date,
            attachment: convertPath,
            a_application_login_id: a_application_login_id,
            company_masters_id: findCompanyId?.company_masters_id || "",
            created_date_time: formattedDate,
            created_by: created_by,
            hourly_leave_duration
        });

        if (newLeaveData) {
            if (leave_duration == 4) {
                await syncHourlyLeaveCompensationCredit(
                    req.tenantDB,
                    findCompanyId?.company_masters_id,
                    a_application_login_id,
                    leave_date,
                    hourly_leave_duration
                );
            }
            const ownerTokenData = await companyVsApplicationLoginModel.findAll({
                where: {
                    isDelete: 0,
                    company_masters_id: findCompanyId.company_masters_id,
                    company_flag: 1,
                },
                attributes: ["a_application_login_id"],
            });

            // Get tokens for each owner a_application_login_id
            const allLoginIds = ownerTokenData.map(
                (item) => item.a_application_login_id
            );

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
                    return [android_refresh_token, web_refresh_token, ios_refresh_token];
                })
                .filter((token) => token && token.trim() !== "");

            if (tokens.length > 0) {
                try {
                    await sendMultipleNotification({
                        deviceTokens: tokens,
                        title: "Leave created",
                        body: remark || "Leave created",
                    });
                } catch (notificationError) {
                    console.error(
                        "Notification failed (non-critical):",
                        notificationError.message
                    );
                }
            } else {
                console.log("No device tokens found for owners.");
            }
        } else {
            console.log("Permission denied: team_leave_entry is not 1");
        }

        if (newLeaveData) {
            return resSuccess({
                data: { item: newLeaveData },
                ack_msg: "Leave created successfully",
            });
        } else {
            return resError({
                ack_msg: "Failed to create Leave",
                developer_msg: "Unable to create Leave due to unknown error",
            });
        }
    } catch (error) {
        console.log("leaveMasterCreate Error", error)
        return resBadRequest({
            ack_msg: "Error",
            developer_msg: `${error.message}`,
        });
    }
};
export const leaveUpdate = async (req) => {
    try {
        const {
            leave_type_id,
            leave_duration,
            remark,
            leave_status,
            leave_date,
            reporting_date,
            a_application_login_id,
            leave_id,
            status_remark,
            created_by,
            leave_hours,      // ← New
            leave_minutes
        } = req.body;
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const attachment = req.file;

        const leaveModel = leavesModel(req.tenantDB);

        let directoryPath;

        const existingLeave = await leaveModel.findOne({
            where: { id: leave_id },
        });

        console.log("cdcdcdcdcdcdcddd", existingLeave);

        let hourly_leave_duration = existingLeave.hourly_leave_duration || "00:00";
        if (leave_duration == 4) {  // Hourly Leave
            const hours = parseInt(leave_hours) || 0;
            const minutes = parseInt(leave_minutes) || 0;

            // Format as HH:MM with leading zeros
            hourly_leave_duration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
        let convertPath = existingLeave?.attachment || ""; // Use existing image if no new image is uploaded
        let mediaName = "";
        if (attachment) {
            directoryPath = path.join(
                process.cwd(),
                "media-folder",
                "leave-images",
                findCompanyId.company_masters_id.toString()
            );

            await fs.mkdirp(directoryPath); // Create directory if it doesn't exist
            const filePath = attachment.path;
            const fileName = path.basename(filePath);
            const destinationPath = path.join(directoryPath, fileName);

            // Move the new image file to the correct directory
            await fs.move(filePath, destinationPath);

            // Delete the old image if it exists
            if (existingLeave && existingLeave.image) {
                const oldImagePath = path.join(
                    process.cwd(),
                    "media-folder",
                    "leave-images",
                    existingLeave.image
                );
                await fs.remove(oldImagePath);
            }

            // Set new image path
            convertPath =
                findCompanyId.company_masters_id.toString() + "/" + fileName;
            mediaName = attachment.originalname || fileName;
        }

        const whereClause = {
            isDelete: 0,
            id: leave_id,
        };

        const updateLeaveResult = await leaveModel.update(
            {
                leave_type_id: leave_type_id,
                leave_duration: leave_duration,
                remark: remark,
                leave_date: leave_date,
                reporting_date: reporting_date,
                leave_status: leave_status,
                attachment: convertPath,
                status_remark: status_remark,
                hourly_leave_duration
            },
            {
                where: whereClause,
            }
        );

        if (updateLeaveResult) {
            if (leave_duration == 4 || existingLeave?.leave_duration == 4) {
                await syncHourlyLeaveCompensationCredit(
                    req.tenantDB,
                    findCompanyId?.company_masters_id,
                    existingLeave?.a_application_login_id || a_application_login_id,
                    leave_date || existingLeave?.leave_date,
                    hourly_leave_duration
                );
            }
            const teamTokenData = await leaveModel.findAll({
                where: {
                    id: leave_id,
                    isDelete: 0,
                },
                attributes: ["a_application_login_id"],
            });
            console.log("yyyyyyyyyyyyyyyyyyyy", teamTokenData);

            const allLoginIds = teamTokenData.map(
                (item) => item.a_application_login_id
            );

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
                    return [android_refresh_token, web_refresh_token, ios_refresh_token];
                })
                .filter((token) => token && token.trim() !== "");

            if (tokens.length > 0) {
                try {
                    await sendMultipleNotification({
                        deviceTokens: tokens,
                        title: `Leave  ${leave_status == 2 ? "Approved" : "Rejected"}`,
                        // body: remark || "A new visit has been created",
                    });
                } catch (notificationError) {
                    console.error(
                        "Notification failed (non-critical):",
                        notificationError.message
                    );
                }
            } else {
                console.log("No device tokens found for owners.");
            }
        } else {
            console.log("Permission denied: team_leave_entry is not 1");
        }
        if (updateLeaveResult) {
            return resSuccess({
                data: { item: updateLeaveResult },
                ack_msg: "Leave Updated Successfully",
            });
        } else {
            return resError({
                ack_msg: "",
                developer_msg: "Leave data is not found!",
            });
        }
    } catch (error) {
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
};