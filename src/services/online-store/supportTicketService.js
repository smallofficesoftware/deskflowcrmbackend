import fs from "fs-extra";
import moment from "moment";
import path from "path";
import Sequelize, { Op } from "sequelize";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import { taskMessageHistroyModel } from "../../models/activities/taskMessageHistroyModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import { statusAndStagesLogsModel } from "../../models/common/statusAndStagesLogsModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { taskCategoryModel } from "../../models/masters/taskCategoryModel.js";
import { TASK_ATTEECHMENT_VIEW } from "../../utils/appConstants.js";
import { formatDateAndTimeCreateDateTimeV2, isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

export const storeSupportTicketCreate = async (req, res) => {
    try {

        const { qr_code, task_title, task_remark, task_category_id, user_name, phone_number, contactID } = req.body;

        const companyIdFind = await companyModel.findOne({
            where: {
                qr_code,
                isDelete: 0
            },
            attributes: ["a_application_login_id", "id", "company_name"],
        });

        if (!companyIdFind) {
            return resError({
                ack_msg: "Company Not Found",
                developer_msg: "Company Not Found",
            });
        }

        req.headers["x-tenant-id"] = companyIdFind.a_application_login_id;
        req.headers["x-company-id"] = companyIdFind.id;
        req.body.company_masters_id = companyIdFind.id;
        await new Promise((resolve, reject) => {
            tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });

        if (!req.tenantDB) {
            return resError(res, { ack_msg: "Tenant DB not initialized" });
        }
        /** ---------------------------------------------------------
     * 5. Find or Create Contact
     ----------------------------------------------------------*/
        const ContactModel = contactModel(req.tenantDB);

        let contactId = null;

        const contactData = await ContactModel.findOne({
            where: {
                id: contactID,
                isDelete: 0
            },
            attributes: ["id"]
        });

        if (contactData) {

            contactId = contactData.id;

        }
        // else {

        //     const newContact = await ContactModel.create({
        //         person_name: username,
        //         company_name: getCompanyName.company_name,
        //         mobile_number: recoveryMobile,
        //         contact_status: -1,
        //         company_masters_id: companyIdFind.company_masters_id,
        //         a_application_login_id: companyIdFind.a_application_login_id,
        //         assinged_to_work_a_application_id: WBSITE_LEAD_ASSIGN_ID,
        //         created_date_time: moment().format("YYYY-MM-DD HH:mm:ss")
        //     });

        //     contactId = newContact.id;

        // }

        /** ---------------------------------------------------------
         * 6. Handle Attachment
         ----------------------------------------------------------*/
        const task_attechment = req.file || {};
        let attachmentPath = null;

        if (task_attechment?.path) {

            const fileName = path.basename(task_attechment.path);

            const directoryPath = path.join(
                process.cwd(),
                "media-folder",
                "store_ticket_attachment",
                companyIdFind.id.toString()
            );

            await fs.mkdir(directoryPath, { recursive: true });

            const destinationPath = path.join(directoryPath, fileName);

            await fs.move(task_attechment.path, destinationPath, {
                overwrite: true
            });

            attachmentPath = `${companyIdFind.id}/${fileName}`;
        }

        /** ---------------------------------------------------------
         * 7. Create Task
         ----------------------------------------------------------*/
        const TaskModel = taskManagementModel(req.tenantDB);
        const now = moment();
        const taskFromdate = now.startOf("day").format("YYYY-MM-DD HH:mm:ss");
        const taskEnddate = now.endOf("day").format("YYYY-MM-DD HH:mm:ss");
        let getUserCreatorDetails = "";

        if (user_name) {
            getUserCreatorDetails += `<br/><b>Name:</b> ${user_name}`;
        }

        if (phone_number) {
            getUserCreatorDetails += `<br/><b>Phone Number:</b> ${phone_number}`;
        }
        const taskPayload = {
            task_title: task_title,
            task_remark: task_remark + getUserCreatorDetails,
            is_support_ticket: 1,
            task_fromdate: taskFromdate,
            task_enddate: taskEnddate,
            contact_masters_id: contactId,
            assigned_team_member: companyIdFind.a_application_login_id,
            a_application_login_id: companyIdFind.a_application_login_id,
            company_masters_id: companyIdFind.id,
            created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
            task_type: 5,
            task_priority: 4,
            task_category_id: task_category_id,
            status: 0,
            external_status: -14,
            team_task_assignement_type: 1,
            task_attechment: attachmentPath || ""
        };

        const newTask = await TaskModel.create(taskPayload);

        if (newTask) {
            if (companyIdFind.a_application_login_id) {
                const assignedMemberIds = companyIdFind.a_application_login_id;

                // Fetch usernames and tokens for all assigned members
                const assignedMembers = await loginModel.findAll({
                    where: {
                        id: assignedMemberIds,
                        isDelete: 0,
                    },
                    attributes: ["id", "username", "web_refresh_token", "android_refresh_token", "ios_refresh_token"],
                });

                // Collect all device tokens
                const allTokens = assignedMembers
                    .flatMap((member) => [
                        member.web_refresh_token,
                        member.android_refresh_token,
                        member.ios_refresh_token,
                    ])
                    .filter((token) => token && token.trim() !== "");

                const uniqueTokens = [...new Set(allTokens)];

                if (uniqueTokens.length > 0) {
                    try {
                        // Get the assigner's username
                        const assigner = await loginModel.findOne({
                            where: {
                                id: a_application_login_id,
                                isDelete: 0,
                            },
                            attributes: ["username"],
                        });

                        const assignerName = assigner?.username || "Someone";

                        // Send notifications to all assigned members
                        await sendMultipleNotification({
                            deviceTokens: uniqueTokens,
                            title: `Ticket number ${newTask.id}... From ${companyIdFind.company_name}... Please Check`,
                            body: `Ticket: ${task_title}`,
                            notification_modual: "customer_support_ticket_create"
                        });
                    } catch (notificationError) {
                        req.logger.error("Notification failed (non-critical):", notificationError.message);
                    }
                } else {
                    req.logger.info("No device tokens found for assigned team members.");
                }
            }
        }

        /** ---------------------------------------------------------
         * 8. Insert Task Message History
         ----------------------------------------------------------*/
        const TaskMessageModel = taskMessageHistroyModel(req.tenantDB);
        const attachmentBlock = attachmentPath
            ? `
    <strong>Attachment:</strong> 
    <a href="${TASK_ATTEECHMENT_VIEW}${attachmentPath}" target="_blank">View Attachment</a><br>
  `
            : "";
        console.log("attachmentPathattachmentPath", attachmentPath);

        const currentDateTime = moment().format("DD-MM-YYYY HH:mm:ss")
        await TaskMessageModel.create({
            task_id: newTask.id,
            a_application_login_id: newTask.a_application_login_id,
            company_masters_id: newTask.company_masters_id,
            description: `
        <strong>Support Ticket Created</strong><br>
        <strong>Issue Title:</strong> ${newTask.task_title}<br>
        <strong>Issue Remark:</strong> ${newTask.task_remark}<br>
        <strong>Created Date Time:</strong> ${currentDateTime}<br>
        ${attachmentBlock}
      `,
            created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
            message_side: "2",
            message_type_id: "0",
            application_login_name: user_name
        });

        /** ---------------------------------------------------------
         * 9. Success Response
         ----------------------------------------------------------*/
        return resSuccess({
            data: { item: newTask.id },
            ack_msg: "Support Ticket Created Successfully"
        });

    } catch (error) {

        console.log("storeSupportTicketCreate error", error);

        return resBadRequest({
            ack_msg: "Error",
            developer_msg: error.message
        });

    }
};

export const storeTicketCategoryGet = async (req, res) => {
    try {
        const { qr_code } = req.body || {};

        const companyIdFind = await companyModel.findOne({
            where: {
                qr_code,
                isDelete: 0
            },
            attributes: ["a_application_login_id", "id"],
        });

        if (!companyIdFind) {
            return resError({
                ack_msg: "Company Not Found",
                developer_msg: "Company Not Found",
            });
        }
        req.headers["x-tenant-id"] = companyIdFind.a_application_login_id;
        req.headers["x-company-id"] = companyIdFind.id;
        req.body.company_masters_id = companyIdFind.id;
        await new Promise((resolve, reject) => {
            tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });

        if (!req.tenantDB) {
            return resError(res, { ack_msg: "Tenant DB not initialized" });
        }

        const TaskCategoryModel = taskCategoryModel(req.tenantDB);

        /** ---------------- FETCH CATEGORY ---------------- */
        const categories = await TaskCategoryModel.findAll({
            where: {
                isDelete: 0,
                visibility: 1, // (you wrote "vasiblity", assuming correct column is "visibility")
            },
            attributes:
                ["task_category_name", "id"],
            order: [["id", "ASC"]],
        });

        // return res.status(200).json({
        //   ack: 1,
        //   data: categories,
        // });

        return resSuccess({
            data: {
                item: categories
            }
        });

    } catch (error) {
        console.error("storeTicketCategoryGet error:", error);

        return resBadRequest({
            developer_msg: error.message
        });
    }
};

export const storeTicketContactGet = async (req, res) => {
    try {
        const { qr_code, contactID } = req.body || {};

        const companyIdFind = await companyModel.findOne({
            where: {
                qr_code,
                isDelete: 0
            },
            attributes: ["a_application_login_id", "id"],
        });

        if (!companyIdFind) {
            return resError({
                ack_msg: "Company Not Found",
                developer_msg: "Company Not Found",
            });
        }
        req.headers["x-tenant-id"] = companyIdFind.a_application_login_id;
        req.headers["x-company-id"] = companyIdFind.id;
        req.body.company_masters_id = companyIdFind.id;
        await new Promise((resolve, reject) => {
            tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });

        if (!req.tenantDB) {
            return resError(res, { ack_msg: "Tenant DB not initialized" });
        }

        const ContactModel = contactModel(req.tenantDB);

        /** ---------------- FETCH CONTACT ---------------- */
        const contactDetails = await ContactModel.findOne({
            where: {
                id: contactID,
                isDelete: 0
            },
            attributes:
                ["person_name", "mobile_number"],
        });



        // return res.status(200).json({
        //   ack: 1,
        //   data: categories,
        // });

        return resSuccess({
            data: {
                item: contactDetails
            }
        });

    } catch (error) {
        console.error("storeTicketContactGet error:", error);

        return resBadRequest({
            developer_msg: error.message
        });
    }
};

export const storeSupportTicketGet = async (req, res) => {
    try {

        const {
            ul,
            ll,
            qr_code,
            contactID,
            searchTerm,
            statusFilter,
            statusFilterComan,
            priorityFilter,
            startDate,
            endDate,
            taskCategoryFilter,
            selectedLabelId
        } = req.body;

        const limit = Number(ll) || 10;
        const offset = Number(ul) || 0;

        /** ---------------- TENANT DB ---------------- */
        const companyIdFind = await companyModel.findOne({
            where: {
                qr_code,
                isDelete: 0
            },
            attributes: ["a_application_login_id", "id", "company_name"],
        });

        if (!companyIdFind) {
            return resError({
                ack_msg: "Company Not Found",
                developer_msg: "Company Not Found",
            });
        }

        req.headers["x-tenant-id"] = companyIdFind.a_application_login_id;
        req.headers["x-company-id"] = companyIdFind.id;
        req.body.company_masters_id = companyIdFind.id;
        await new Promise((resolve, reject) => {
            tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });

        if (!req.tenantDB) {
            return resError(res, { ack_msg: "Tenant DB not initialized" });
        }

        /** ---------------- MODELS ---------------- */
        const TaskModel = taskManagementModel(req.tenantDB);
        const TaskCategoryModel = taskCategoryModel(req.tenantDB);
        /** ---------------- WHERE ---------------- */
        let whereClause = {
            contact_masters_id: contactID,
            is_support_ticket: "1",
            isDelete: "0",
            external_status: {
                [Op.and]: {
                    [Op.ne]: null,
                    [Op.ne]: ""
                }
            }
        };
        // if (companyIdFind.company_flag !== 1) {
        //     whereClause.customer_application_login_id = a_application_login_id;
        // }
        // STATUS
        if (Array.isArray(statusFilterComan) && statusFilterComan.length > 0) {
            whereClause.status = { [Op.in]: statusFilterComan };
        } else if (statusFilter) {
            whereClause.status = statusFilter;
        }

        // PRIORITY
        if (priorityFilter) {
            whereClause.task_priority = priorityFilter;
        }

        // CATEGORY
        if (taskCategoryFilter) {
            whereClause.task_category_id = taskCategoryFilter;
        }

        // LABEL
        if (selectedLabelId) {
            whereClause = {
                [Op.and]: [
                    whereClause,
                    Sequelize.literal(`FIND_IN_SET(${selectedLabelId}, label_id)`)
                ]
            };
        }

        // DATE
        if (startDate && endDate) {
            whereClause.created_date_time = {
                [Op.between]: [
                    moment(startDate + " 00:00:00").format("YYYY-MM-DD HH:mm:ss"),
                    moment(endDate + " 23:59:59").format("YYYY-MM-DD HH:mm:ss")
                ]
            };
        }

        // SEARCH
        if (searchTerm && searchTerm !== "undefined") {
            whereClause = {
                [Op.and]: [
                    whereClause,
                    {
                        [Op.or]: [
                            { task_title: { [Op.like]: `%${searchTerm}%` } },
                            { task_remark: { [Op.like]: `%${searchTerm}%` } },
                            { id: { [Op.like]: `%${searchTerm}%` } }
                        ]
                    }
                ]
            };
        }

        /** ---------------- FETCH ---------------- */

        const tasks = await TaskModel.findAll({
            where: whereClause,
            limit,
            offset,
            order: [["created_date_time", "DESC"]],
            attributes: [
                "id",
                "task_title",
                "task_category_id",
                "task_attechment",
                "label_id",
                "task_fromdate",
                "task_enddate",
                "task_remark",
                "task_type",
                "status",
                "customer_company_id",
                "customer_application_login_id",
                "created_date_time",
                [Sequelize.literal(`(
          SELECT contact_masters.person_name
          FROM contact_masters
          WHERE contact_masters.id = task_managements.contact_masters_id
            AND contact_masters.isDelete = 0
        )`), "contact_person_name"],
                [Sequelize.literal(`(
          SELECT contact_masters.mobile_number
          FROM contact_masters
          WHERE contact_masters.id = task_managements.contact_masters_id
            AND contact_masters.isDelete = 0
        )`), "contact_person_number"],
                [
                    Sequelize.literal(`(
            SELECT GROUP_CONCAT(lable_masters.lable_name)
            FROM lable_masters
            WHERE lable_masters.isDelete = 0
            AND FIND_IN_SET(lable_masters.id, task_managements.label_id)
          )`),
                    "label_name"
                ],
                [
                    Sequelize.literal(`(
            SELECT stage_status_masters.name
            FROM stage_status_masters
            WHERE stage_status_masters.id = task_managements.external_status
              AND stage_status_masters.isDelete = 0
              AND stage_status_masters.visibility = 1
            LIMIT 1
          )`),
                    "status_name"
                ],
                [
                    Sequelize.literal(`(
            SELECT stage_status_masters.color
            FROM stage_status_masters
            WHERE stage_status_masters.id = task_managements.external_status
              AND stage_status_masters.isDelete = 0
              AND stage_status_masters.visibility = 1
            LIMIT 1
          )`),
                    "status_color"
                ]
            ],
            raw: true
        });
        console.log("taskstaskstaskstaskstasks", tasks);

        /** ---------------- CATEGORY MAP ---------------- */
        const categoryIds = [
            ...new Set(tasks.map(t => t.task_category_id).filter(Boolean))
        ];

        let categoryMap = new Map();

        if (categoryIds.length > 0) {
            const categories = await TaskCategoryModel.findAll({
                where: {
                    id: { [Op.in]: categoryIds },
                    isDelete: "0",
                    visibility: "1"
                },
                attributes: ["id", "task_category_name", "task_color"],
                raw: true
            });

            categoryMap = new Map(categories.map(c => [c.id, c]));
        }

        /** ---------------- FINAL RESPONSE ---------------- */
        const finalData = tasks.map(task => {
            const category = categoryMap.get(task.task_category_id);
            let task_attechment_url = "";
            if (task.task_attechment) {
                task_attechment_url = `${TASK_ATTEECHMENT_VIEW}${task.task_attechment}`;
            }

            return {
                task_title: task.task_title,
                task_category_id: task.task_category_id,
                media_url: task_attechment_url,
                // label_name: task.label_name || "",
                status_name: task.status_name || "",
                status_color: task.status_color || "",
                category_name: category?.task_category_name || "",
                category_color: category?.task_color || "",
                customer_company_id: task.customer_company_id,
                customer_application_login_id: task.customer_application_login_id,
                contact_person_name: task.contact_person_name,
                contact_person_number: task.contact_person_number,
                // label_id: task.label_id,
                ids: task.id,
                task_fromdate: task.task_fromdate
                    ? moment(task.task_fromdate).format("DD-MM-YYYY hh:mm A")
                    : null,
                task_enddate: task.task_enddate
                    ? moment(task.task_enddate).format("DD-MM-YYYY hh:mm A")
                    : null,
                task_remark: task.task_remark,
                // task_type: task.task_type,
                status: task.status,
                created_date_time: task.created_date_time
                    ? moment(task.created_date_time).format("DD-MM-YYYY hh:mm A")
                    : null,
            };
        });

        /** ---------------- COUNT ---------------- */
        const total = await TaskModel.count({ where: whereClause });

        /** ---------------- RESPONSE ---------------- */
        return resSuccess({
            data: {
                item: finalData,
                total_count: total
            }
        });

    } catch (error) {
        console.error("storeSupportTicketGet error:", error);

        return resBadRequest({
            developer_msg: error.message
        });
    }
};

export const storeTicketStatusLogFetch = async (req, res) => {
    try {
        const { reference_id } = req.body;

        if (!isValid(reference_id)) {
            return resError({
                ack_msg: "Invalid Request",
                developer_msg: "reference_id not found",
            });
        }

        const { qr_code } = req.body;

        const companyIdFind = await companyModel.findOne({
            where: {
                qr_code,
                isDelete: 0
            },
            attributes: ["a_application_login_id", "id", "company_name"],
        });

        if (!companyIdFind) {
            return resError({
                ack_msg: "Company Not Found",
                developer_msg: "Company Not Found",
            });
        }

        req.headers["x-tenant-id"] = companyIdFind.a_application_login_id;
        req.headers["x-company-id"] = companyIdFind.id;
        req.body.company_masters_id = companyIdFind.id;
        await new Promise((resolve, reject) => {
            tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });

        if (!req.tenantDB) {
            return resError(res, { ack_msg: "Tenant DB not initialized" });
        }

        const statusAndStagesLogsModelIntance =
            statusAndStagesLogsModel(req.tenantDB);
        const stagestatusModelInstance = stagestatusModel(req.tenantDB);

        const getStageAndStatus = await stagestatusModelInstance.findAll({
            where: {
                isDelete: 0,
                order_type: 8,
                visibility: 1,
            },
            raw: true,
            attributes: ["name", "color", "id"],
        });
        const statusArray = getStageAndStatus.map(v => v.id);

        const stageAndStatusNameMap = new Map(
            getStageAndStatus.map((e) => [String(e.id), e.name])
        );
        const stageAndStatusColorMap = new Map(
            getStageAndStatus.map((e) => [String(e.id), e.color])
        );

        // Get Status Logs (ONLY task_managements)
        const getDBStatusLogList =
            await statusAndStagesLogsModelIntance.findAll({
                where: {
                    isDelete: "0",
                    reference_table: "task_managements",
                    status_id: { [Op.in]: statusArray },
                    reference_id,
                },
                raw: true,
                attributes: [
                    "reference_table",
                    "reference_id",
                    "information",
                    "status_id",
                    "previous_status_id",
                    "updated_by",
                    "updated_date_time",
                ],
                order: [["updated_date_time", "DESC"]],
            });

        const finalList = await Promise.all(
            getDBStatusLogList.map(async (v) => {
                const dbUpdatedBy = await loginModel.findOne({
                    where: {
                        isDelete: 0,
                        id: v.updated_by,
                    },
                    raw: true,
                    attributes: ["username"],
                });

                return {
                    ...v,
                    updated_date_time: v.updated_date_time
                        ? formatDateAndTimeCreateDateTimeV2(v.updated_date_time)
                        : "",
                    status_color_code:
                        stageAndStatusColorMap.get(String(v.status_id)) || "",
                    status_name:
                        stageAndStatusNameMap.get(String(v.status_id)) || "",
                    updated_by_name: isValid(dbUpdatedBy)
                        ? dbUpdatedBy.username
                        : "",
                };
            })
        );

        return resSuccess({
            data: finalList,
        });
    } catch (error) {
        console.log("storeTicketStatusLogFetch error", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const storeTicketMessageGet = async (req, res) => {
    try {
        const { reference_id } = req.body;

        if (!isValid(reference_id)) {
            return resError({
                ack_msg: "Invalid Request",
                developer_msg: "reference_id not found",
            });
        }

        const { qr_code } = req.body;

        const companyIdFind = await companyModel.findOne({
            where: {
                qr_code,
                isDelete: 0
            },
            attributes: ["a_application_login_id", "id", "company_name"],
        });

        if (!companyIdFind) {
            return resError({
                ack_msg: "Company Not Found",
                developer_msg: "Company Not Found",
            });
        }

        req.headers["x-tenant-id"] = companyIdFind.a_application_login_id;
        req.headers["x-company-id"] = companyIdFind.id;
        req.body.company_masters_id = companyIdFind.id;
        await new Promise((resolve, reject) => {
            tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });

        if (!req.tenantDB) {
            return resError(res, { ack_msg: "Tenant DB not initialized" });
        }

        const taskMessageHistroyModelIntance = taskMessageHistroyModel(req.tenantDB);

        const finalList = await taskMessageHistroyModelIntance.findAll({
            where: {
                isDelete: 0,
                a_application_login_id: companyIdFind.a_application_login_id,
                task_id: reference_id,
                message_side: 2
            },
            raw: true,
            attributes: ["description", "created_date_time", "application_login_name"],
        });

        return resSuccess({
            data: finalList,
        });
    } catch (error) {
        console.log("storeTicketMessageGet error", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const storeTicketMessageCreate = async (req, res) => {
    try {

        const {
            qr_code,
            contactID,
            reference_id,
            description
        } = req.body;

        const companyIdFind = await companyModel.findOne({
            where: {
                qr_code,
                isDelete: 0
            },
            attributes: ["a_application_login_id", "id"],
        });

        if (!companyIdFind) {
            return resError({
                ack_msg: "Company Not Found",
                developer_msg: "Company Not Found",
            });
        }

        req.headers["x-tenant-id"] = companyIdFind.a_application_login_id;
        req.headers["x-company-id"] = companyIdFind.id;
        req.body.company_masters_id = companyIdFind.id;
        await new Promise((resolve, reject) => {
            tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });

        if (!req.tenantDB) {
            return resError(res, { ack_msg: "Tenant DB not initialized" });
        }

        const ContactModel = contactModel(req.tenantDB);

        /** ---------------- FETCH CONTACT ---------------- */
        const contactDetails = await ContactModel.findOne({
            where: {
                id: contactID,
                isDelete: 0
            },
            attributes:
                ["person_name", "mobile_number"],
        });

        const TaskMessageModel = taskMessageHistroyModel(req.tenantDB);
        const currentDateTime = moment().format("DD-MM-YYYY HH:mm:ss")
        await TaskMessageModel.create({
            task_id: reference_id,
            a_application_login_id: companyIdFind.a_application_login_id,
            description: description,
            created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
            message_side: 2,
            message_type_id: 0,
            is_reminder: 0,
            application_login_name: contactDetails.person_name
        });

        /** ---------------------------------------------------------
         * 9. Success Response
         ----------------------------------------------------------*/
        return resSuccess({
            data: { item: TaskMessageModel },
            ack_msg: "Support Ticket Created Successfully"
        });

    } catch (error) {

        console.log("storeSupportTicketCreate error", error);

        return resBadRequest({
            ack_msg: "Error",
            developer_msg: error.message
        });

    }
};