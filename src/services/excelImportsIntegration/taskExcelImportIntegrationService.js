import moment from "moment";
import { Op } from "sequelize";
import XLSX from "xlsx";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import { taskMessageHistroyModel } from "../../models/activities/taskMessageHistroyModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { taskCategoryModel } from "../../models/masters/taskCategoryModel.js";
import {
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

const parseExcelDateTime = (value) => {

    if (value === undefined || value === null || value === "") {
        return null;
    }

    let m = null;

    // Excel serial number
    if (typeof value === "number") {

        const excelDate = XLSX.SSF.format("yyyy-mm-dd hh:mm:ss", value);

        m = moment(excelDate, "YYYY-MM-DD HH:mm:ss", true);

    }

    // String Date
    else if (typeof value === "string") {

        const trimmed = value.trim();

        const formats = [
            "DD-MM-YYYY HH:mm:ss",
            "DD-MM-YYYY hh:mm:ss",
            "DD-MM-YYYY hh:mm A",
            "DD/MM/YYYY HH:mm:ss",
            "DD/MM/YYYY hh:mm:ss",
            "DD/MM/YYYY hh:mm A",
            "YYYY-MM-DD HH:mm:ss",
            "DD-MM-YYYY",
            "DD/MM/YYYY"
        ];

        m = moment(trimmed, formats, true);

    }

    if (!m || !m.isValid()) {
        return null;
    }

    return m;

};
// export const addTaskByExcelSheet = async (req) => {
//     try {
//         if (!req.file) {
//             return resBadRequest({
//                 ack_msg: "No file uploaded",
//                 developer_msg: "Please upload an Excel file",
//             });
//         }

//         const { a_application_login_id } = req.body;

//         if (!a_application_login_id) {
//             return resBadRequest({
//                 ack_msg: "Missing authentication details",
//                 developer_msg: "a_application_login_id is required",
//             });
//         }

//         const findCompanyId = await getCompanyByLoginId(a_application_login_id);
//         if (!findCompanyId || !findCompanyId.company_masters_id) {
//             return resBadRequest({
//                 ack_msg: "Invalid company ID",
//                 developer_msg: "Could not retrieve company ID",
//             });
//         }

//         const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

//         const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
//         const sheetName = workbook.SheetNames[0];
//         const worksheet = workbook.Sheets[sheetName];
//         const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

//         const definedColumn = {
//             task_title: "task_title",
//             task_category_id: "task_category_id",
//             task_priority: "task_priority",
//             task_type: "task_type",
//             task_fromdate: "task_fromdate",
//             task_enddate: "task_enddate",
//             task_remark: "task_remark",
//             assigned_team_member: "assigned_team_member",
//             is_notification_sand_wp: "is_notification_sand_wp",
//             is_notification_sand_email: "is_notification_sand_email",
//             team_task_assignement_type: "is_task_groups_or_individual",
//         };

//         const mandetoryField = [
//             "task_title",
//             "task_category_id",
//             "task_priority",
//             "task_type",
//             "task_fromdate",
//             "task_enddate",
//             "assigned_team_member",
//         ];

//         const columns = data[0];
//         const missingFields = mandetoryField.filter(f => !columns.includes(f));

//         if (missingFields.length > 0) {
//             return resError({
//                 ack_msg: `Missing mandatory fields: ${missingFields}`,
//                 developer_msg: `Missing mandatory fields: ${missingFields}`,
//             });
//         }

//         const onlyData = data.slice(1);
//         if (!isValid(onlyData)) {
//             return resError({
//                 ack_msg: `No Data found in current sheet.`,
//                 developer_msg: `Excel Rows Data are not exist`,
//             });
//         }

//         let filterdData = [];
//         for (let i = 0; i < onlyData.length; i++) {
//             let obj = {};
//             columns.map((v, j) => {
//                 obj[definedColumn[v]] = onlyData[i][j] || "";
//             });
//             filterdData.push(obj);
//         }

//         const TaskModel = taskManagementModel(req.tenantDB);
//         const TaskCategoryModel = taskCategoryModel(req.tenantDB);
//         // const LoginModel = loginModel(req.tenantDB);

//         // ================= MASTER LIST =================

//         const taskTypesList = [
//             { id: "1", type_name: "Daily" },
//             { id: "2", type_name: "Weekly" },
//             { id: "3", type_name: "Monthly" },
//             { id: "4", type_name: "Yearly" },
//             { id: "5", type_name: "Once" },
//             { id: "6", type_name: "Repeat After Two Month" },
//             { id: "7", type_name: "Repeat After Three Month" },
//             { id: "9", type_name: "Repeat After Four Month" },
//             { id: "8", type_name: "Repeat After Six Month" },
//             { id: "10", type_name: "Repeat After Eight Month" },
//         ];

//         const taskPriorityList = [
//             { id: "1", mode_name: "Low" },
//             { id: "2", mode_name: "Medium" },
//             { id: "3", mode_name: "High" },
//             { id: "4", mode_name: "Critical" }
//         ];

//         const existingCategories = await TaskCategoryModel.findAll({
//             where: {
//                 company_masters_id: findCompanyId.company_masters_id,
//                 isDelete: 0
//             },
//             raw: true
//         });

//         const categoryMap = new Map(
//             existingCategories.map(c => [c.task_category_name.toLowerCase(), c.id])
//         );

//         const allUsers = await loginModel.findAll({
//             where: {
//                 isDelete: 0
//             },
//             raw: true,
//             attributes: ["id", "username"]
//         });

//         const userMap = new Map(
//             allUsers.map(u => [u.username.toLowerCase(), u.id])
//         );

//         let skippedRows = [];
//         let sanitizedData = [];

//         for (let i = 0; i < filterdData.length; i++) {

//             const rowNumber = i + 1;
//             const v = filterdData[i];

//             const task_title = v.task_title?.toString().trim();
//             const task_category_name = v.task_category_id?.toString().trim();
//             const task_type_name = v.task_type?.toString().trim();
//             const task_priority_name = v.task_priority?.toString().trim();
//             const task_fromdate = v.task_fromdate;
//             const task_enddate = v.task_enddate;
//             const assigned_team_member = v.assigned_team_member?.toString().trim();

//             if (!task_title || !task_category_name || !task_fromdate || !task_enddate) {
//                 skippedRows.push(rowNumber);
//                 continue;
//             }

//             // ================= CATEGORY =================
//             let category_id = categoryMap.get(task_category_name.toLowerCase());

//             if (!category_id) {
//                 const newCategory = await TaskCategoryModel.create({
//                     task_category_name: task_category_name,
//                     company_masters_id: findCompanyId.company_masters_id,
//                     a_application_login_id: a_application_login_id,
//                     created_date_time: formattedDate
//                 });

//                 category_id = newCategory.id;
//                 categoryMap.set(task_category_name.toLowerCase(), category_id);
//             }

//             // ================= TASK TYPE =================
//             let taskTypeObj = taskTypesList.find(
//                 t => t.type_name.toLowerCase() === task_type_name?.toLowerCase()
//             );
//             const task_type = taskTypeObj ? taskTypeObj.id : "5"; // default Once

//             // ================= PRIORITY =================
//             let priorityObj = taskPriorityList.find(
//                 p => p.mode_name.toLowerCase() === task_priority_name?.toLowerCase()
//             );
//             const task_priority = priorityObj ? priorityObj.id : "1"; // default Low

//             // ================= DATE VALIDATION =================
//             const fromMoment = parseExcelDateTime(task_fromdate);
//             const endMoment = parseExcelDateTime(task_enddate);

//             if (!fromMoment || !endMoment) {
//                 skippedRows.push(rowNumber);
//                 continue;
//             }

//             // Now format them for database
//             const fromDate = fromMoment.format("YYYY-MM-DD HH:mm:ss");
//             const endDate = endMoment.format("YYYY-MM-DD HH:mm:ss");

//             // Check if end is after from (strictly greater)
//             if (!endMoment.isAfter(fromMoment)) {
//                 skippedRows.push(rowNumber);
//                 // Optional: you can log reason
//                 // console.log(`Row ${rowNumber}: end date is not after from date`);
//                 continue;
//             }

//             // ================= ASSIGNED MEMBER =================
//             const memberNames = assigned_team_member.split(",").map(n => n.trim().toLowerCase());
//             let matchedIds = [];

//             memberNames.forEach(name => {
//                 if (userMap.has(name)) {
//                     matchedIds.push(userMap.get(name));
//                 }
//             });
//             console.log("matchedIdsmatchedIds", matchedIds);

//             if (matchedIds.length === 0) {
//                 skippedRows.push(rowNumber);
//                 continue;
//             }

//             // ================= NOTIFICATION =================
//             const is_notification_sand_wp =
//                 v.is_notification_sand_wp?.toString().toLowerCase() === "yes" ? 1 : 0;

//             const is_notification_sand_email =
//                 v.is_notification_sand_email?.toString().toLowerCase() === "yes" ? 1 : 0;

//             sanitizedData.push({
//                 task_title,
//                 task_category_id: category_id,
//                 task_type,
//                 task_priority,
//                 task_fromdate: fromDate,     // ← formatted string
//                 task_enddate: endDate,
//                 task_remark: v.task_remark || "",
//                 assigned_team_member: matchedIds.join(","),
//                 is_notification_sand_wp,
//                 is_notification_sand_email,
//                 company_masters_id: findCompanyId.company_masters_id,
//                 a_application_login_id,
//                 created_date_time: formattedDate
//             });
//         }

//         if (sanitizedData.length === 0) {
//             return resError({
//                 ack_msg: "No valid task found.",
//                 developer_msg: `Skipped Rows: ${skippedRows.join(",")}`
//             });
//         }

//         await TaskModel.bulkCreate(sanitizedData, {
//             validate: true,
//             returning: true
//         });

//         return resSuccess({
//             ack: 1,
//             ack_msg: "Successfully imported",
//             developer_msg: "Successfully imported",
//             data: skippedRows.length > 0
//                 ? `Skipped Rows: ${skippedRows.join(",")}`
//                 : ""
//         });

//     } catch (error) {
//         console.log("addTaskByExcelSheet Error", error);
//         return resError({
//             ack_msg: "Unexpected error occurred during excel import.",
//             developer_msg: error.message,
//         });
//     }
// };



export const addTaskByExcelSheet = async (req) => {
    try {

        if (!req.file) {
            return resBadRequest({
                ack_msg: "No file uploaded",
                developer_msg: "Please upload an Excel file",
            });
        }

        const { a_application_login_id } = req.body;

        if (!a_application_login_id) {
            return resBadRequest({
                ack_msg: "Missing authentication details",
                developer_msg: "a_application_login_id is required",
            });
        }

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        if (!findCompanyId || !findCompanyId.company_masters_id) {
            return resBadRequest({
                ack_msg: "Invalid company ID",
                developer_msg: "Could not retrieve company ID",
            });
        }

        const formattedDate = moment().format("YYYY-MM-DD HH:mm:ss");

        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const definedColumn = {
            task_title: "task_title",
            task_category_id: "task_category_id",
            task_priority: "task_priority",
            task_type: "task_type",
            task_fromdate: "task_fromdate",
            task_enddate: "task_enddate",
            task_remark: "task_remark",
            assigned_team_member: "assigned_team_member",
            is_notification_sand_wp: "is_notification_sand_wp",
            is_notification_sand_email: "is_notification_sand_email",
            is_task_groups_or_individual: "is_task_groups_or_individual",
            selected_task_days: "selected_task_days",
            task_selected_date: "task_selected_date",
        };

        const mandetoryField = [
            "task_title",
            "task_category_id",
            "task_priority",
            "task_type",
            "task_fromdate",
            "task_enddate",
            "assigned_team_member",
        ];

        const columns = data[0];

        const missingFields = mandetoryField.filter(f => !columns.includes(f));

        if (missingFields.length > 0) {
            return resError({
                ack_msg: `Missing mandatory fields: ${missingFields}`,
                developer_msg: `Missing mandatory fields: ${missingFields}`,
            });
        }

        const onlyData = data.slice(1);

        if (!onlyData.length) {
            return resError({
                ack_msg: `No Data found in current sheet.`,
                developer_msg: `Excel Rows Data are not exist`,
            });
        }

        let filterdData = [];

        for (let i = 0; i < onlyData.length; i++) {
            let obj = {};
            columns.map((v, j) => {
                obj[definedColumn[v]] = onlyData[i][j] || "";
            });
            filterdData.push(obj);
        }

        const TaskModel = taskManagementModel(req.tenantDB);
        const TaskCategoryModel = taskCategoryModel(req.tenantDB);
        const TaskModelChatMessageHistory = taskMessageHistroyModel(req.tenantDB);
        const taskTypesList = [
            { id: "1", type_name: "Daily" },
            { id: "2", type_name: "Weekly" },
            { id: "3", type_name: "Monthly" },
            { id: "4", type_name: "Yearly" },
            { id: "5", type_name: "Once" },
            { id: "6", type_name: "Repeat After Two Month" },
            { id: "7", type_name: "Repeat After Three Month" },
            { id: "9", type_name: "Repeat After Four Month" },
            { id: "8", type_name: "Repeat After Six Month" },
            { id: "10", type_name: "Repeat After Eight Month" },
        ];

        const selectWeeklyDays = [
            { id: "1", days_name: "Monday" },
            { id: "2", days_name: "Tuesday" },
            { id: "3", days_name: "Wednesday" },
            { id: "4", days_name: "Thursday" },
            { id: "5", days_name: "Friday" },
            { id: "6", days_name: "Saturday" },
            { id: "7", days_name: "Sunday" },
            { id: "1", days_name: "Mon" },
            { id: "2", days_name: "Tue" },
            { id: "3", days_name: "Wed" },
            { id: "4", days_name: "Thur" },
            { id: "5", days_name: "Fri" },
            { id: "6", days_name: "Sat" },
            { id: "7", days_name: "Sun" },
        ];

        const taskPriorityList = [
            { id: "1", mode_name: "Low" },
            { id: "2", mode_name: "Medium" },
            { id: "3", mode_name: "High" },
            { id: "4", mode_name: "Critical" }
        ];

        const weeklyDayMap = new Map(
            selectWeeklyDays.map(d => [d.days_name.toLowerCase(), d.id])
        );

        const existingCategories = await TaskCategoryModel.findAll({
            where: {
                company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0
            },
            raw: true
        });

        const categoryMap = new Map(
            existingCategories.map(c => [c.task_category_name.toLowerCase(), c.id])
        );

        let skippedRows = [];
        let sanitizedData = [];

        for (let i = 0; i < filterdData.length; i++) {

            const rowNumber = i + 2;
            const v = filterdData[i];

            const task_title = v.task_title?.toString().trim();
            const task_category_name = v.task_category_id?.toString().trim();
            const task_type_name = v.task_type?.toString().trim();
            const task_priority_name = v.task_priority?.toString().trim();
            const task_fromdate = v.task_fromdate;
            const task_enddate = v.task_enddate;
            const assigned_team_member = v.assigned_team_member?.toString().trim();
            const assignmentType = v.is_task_groups_or_individual?.toString().trim();


            if (!task_title || !task_category_name) {
                skippedRows.push(`Row ${rowNumber} : Missing task title or category`);
                continue;
            }

            // CATEGORY 
            let category_id = categoryMap.get(task_category_name.toLowerCase());

            if (!category_id) {

                const newCategory = await TaskCategoryModel.create({
                    task_category_name,
                    company_masters_id: findCompanyId.company_masters_id,
                    a_application_login_id,
                    created_date_time: formattedDate
                });

                category_id = newCategory.id;

                categoryMap.set(task_category_name.toLowerCase(), category_id);
            }

            // TASK TYPE
            const taskTypeObj = taskTypesList.find(
                t => t.type_name.toLowerCase() === task_type_name?.toLowerCase()
            );

            if (!taskTypeObj) {
                skippedRows.push(`Row ${rowNumber} : Invalid task type (${task_type_name})`);
                continue;
            }

            const task_type = taskTypeObj.id;

            // PRIORITY
            const priorityObj = taskPriorityList.find(
                p => p.mode_name.toLowerCase() === task_priority_name?.toLowerCase()
            );

            const task_priority = priorityObj ? priorityObj.id : "1";

            // DATE VALIDATION
            let selected_task_days = "";
            let task_selected_date = "";

            // DAILY DATE OVERRIDE
            let fromMoment = parseExcelDateTime(task_fromdate);
            let endMoment = parseExcelDateTime(task_enddate);
            // console.log("form datessssssss", fromMoment);
            // console.log("end datesssssssss", endMoment);
            // return;
            if (task_type == "1") {
                const today = moment().format("YYYY-MM-DD HH:mm:ss");
                fromMoment = moment(today);
                endMoment = moment(today);
            }

            if (!fromMoment || !endMoment || !endMoment.isSameOrAfter(fromMoment)) {
                skippedRows.push(`Row ${rowNumber} : end date(${endMoment}) is less than to (${fromMoment}) please add correct date`);
                continue;
            }

            // const fromDate = fromMoment.format("YYYY-MM-DD HH:mm:ss");
            // const endDate = endMoment.format("YYYY-MM-DD HH:mm:ss");


            // const endDate = endMoment;

            // TASK TYPE BASED FIELD VALIDATION

            // WEEKLY
            if (task_type == "2") {

                if (!v.selected_task_days) {
                    skippedRows.push(`Row ${rowNumber} : Weekly task requires selected_task_days`);
                    continue;
                }

                const days = v.selected_task_days.toString().split(",").map(d => d.trim().toLowerCase());

                let matchedDays = [];

                for (const day of days) {

                    const dayId = weeklyDayMap.get(day);

                    if (dayId) {
                        matchedDays.push(dayId);
                    }

                }

                if (!matchedDays.length) {
                    skippedRows.push(`Row ${rowNumber} : Invalid weekly days (${v.selected_task_days})`);
                    continue;
                }

                selected_task_days = matchedDays.join(",");
                task_selected_date = "";
                fromMoment = "";
                endMoment = "";
            }

            // MONTHLY / YEARLY / REPEAT TYPES

            else if (
                ["3", "4", "6", "7", "8", "9", "10"].includes(task_type)
            ) {

                if (!v.task_selected_date) {
                    skippedRows.push(rowNumber);
                    continue;
                }

                const parsedDate = parseExcelDateTime(v.task_selected_date);

                if (!parsedDate) {
                    skippedRows.push(`Row ${rowNumber} : Invalid task_selected_date`);
                    continue;
                }

                task_selected_date = parsedDate.format("YYYY-MM-DD");
                selected_task_days = "";
                fromMoment = "";
                endMoment = "";

            }

            // DAILY / ONCE

            else if (["1", "5"].includes(task_type)) {

                selected_task_days = "";
                task_selected_date = "";

            }

            // NOTIFICATION VALIDATION

            const wpVal = v.is_notification_sand_wp?.toString().toLowerCase();
            const emailVal = v.is_notification_sand_email?.toString().toLowerCase();

            if (!["yes", "no"].includes(wpVal) || !["yes", "no"].includes(emailVal)) {
                skippedRows.push(rowNumber);
                continue;
            }

            const is_notification_sand_wp = wpVal === "yes" ? 1 : 0;
            const is_notification_sand_email = emailVal === "yes" ? 1 : 0;

            // ASSIGNMENT TYPE VALIDATION

            if (!["1", "2"].includes(assignmentType)) {
                skippedRows.push(`Row ${rowNumber} : Invalid is_task_groups_or_individual please do addon atleast (1) mins task create group and 2 mins task create individual `);
                continue;
            }

            // ASSIGNED MEMBER (NEW LOGIC)

            const memberNames = assigned_team_member
                .split(",")
                .map(n => n.trim())
                .filter(n => n.length > 0);

            if (memberNames.length === 0) {
                skippedRows.push(`Row ${rowNumber} : No valid team member names provided`);
                continue;
            }

            const validUserIds = [];

            for (const name of memberNames) {
                // Find possible matching users by username (LIKE %name%)
                const possibleUsers = await loginModel.findAll({
                    where: {
                        username: {
                            [Op.like]: `%${name}%`
                        },
                        isDelete: 0
                    },
                    attributes: ['id', 'username'],
                    raw: true,
                    limit: 5, // ← safety: prevent too many false matches
                });
                console.log("possibleUsers", possibleUsers);

                if (possibleUsers.length === 0) {
                    skippedRows.push(`Row ${rowNumber} : No user found for "${name}"`);
                    continue;
                }

                // Now check which of them actually belong to this company
                const candidateIds = possibleUsers.map(u => u.id);

                const companyUsers = await companyVsApplicationLoginModel.findAll({
                    where: {
                        a_application_login_id: { [Op.in]: candidateIds },
                        company_masters_id: findCompanyId.company_masters_id, // ← very important!
                        isDelete: 0
                    },
                    attributes: ['a_application_login_id'],
                    raw: true,
                });

                if (companyUsers.length === 0) {
                    skippedRows.push(`Row ${rowNumber} : "${name}" not found in this company`);
                    continue;
                }


                companyUsers.forEach(rec => {
                    validUserIds.push(rec.a_application_login_id);
                });
            }

            const uniqueValidIds = [...new Set(validUserIds)];

            if (uniqueValidIds.length === 0) {
                skippedRows.push(`Row ${rowNumber} : No valid team members found in this company`);
                continue;
            }

            // matchedIds = [...new Set(matchedIds)];

            // if (!matchedIds.length) continue;

            // CREATE TASK

            if (assignmentType === "1") { // group TASK

                sanitizedData.push({
                    task_title,
                    task_category_id: category_id,
                    task_type,
                    task_priority,
                    task_fromdate: fromMoment,
                    task_enddate: endMoment,
                    task_remark: v.task_remark || "",
                    assigned_team_member: uniqueValidIds.join(","),
                    is_notification_sand_wp,
                    is_notification_sand_email,
                    selected_task_days,
                    task_selected_date,
                    company_masters_id: findCompanyId.company_masters_id,
                    a_application_login_id,
                    created_date_time: formattedDate,
                    status: -3
                });

            } else { // individual tasks

                uniqueValidIds.forEach(userId => {
                    sanitizedData.push({
                        task_title,
                        task_category_id: category_id,
                        task_type,
                        task_priority,
                        task_fromdate: fromMoment,
                        task_enddate: endMoment,
                        task_remark: v.task_remark || "",
                        assigned_team_member: userId.toString(),
                        is_notification_sand_wp,
                        is_notification_sand_email,
                        selected_task_days,
                        task_selected_date,
                        company_masters_id: findCompanyId.company_masters_id,
                        a_application_login_id,
                        created_date_time: formattedDate,
                        team_task_assignement_type: 1,
                        status: -3
                    });
                });
            }

        }

        if (!sanitizedData.length) {
            return resError({
                ack_msg: "No valid task found.",
                developer_msg: `Skipped Rows: ${skippedRows.join(",")}`
            });
        }

        const createdTasks = await TaskModel.bulkCreate(sanitizedData, {
            validate: true,
            returning: true
        });
        let messageHistoryData = [];

        for (const task of createdTasks) {

            const taskTypeName = taskTypesList.find(t => t.id == task.task_type)?.type_name || "";
            const taskPriorityName = taskPriorityList.find(p => p.id == task.task_priority)?.mode_name || "";
            const categoryName = existingCategories.find(c => c.id == task.task_category_id)?.task_category_name || "";
            const taskStatusName = "Created";

            const formattedFromDate = task.task_fromdate
                ? moment(task.task_fromdate).format("YYYY-MM-DD HH:mm:ss")
                : "";

            const formattedEndDate = task.task_enddate
                ? moment(task.task_enddate).format("YYYY-MM-DD HH:mm:ss")
                : "";

            let selectedDaysNames = "";

            if (task.selected_task_days) {

                const ids = task.selected_task_days.split(",");

                selectedDaysNames = selectWeeklyDays
                    .filter(d => ids.includes(d.id))
                    .map(d => d.days_name)
                    .join(", ");

            }

            messageHistoryData.push({
                task_id: task.id,
                message_type_id: 0,
                company_masters_id: task.company_masters_id,
                a_application_login_id: task.a_application_login_id,
                message_side: 1,
                created_date_time: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
                description: `
<strong>Task Title:</strong> ${task.task_title}<br>
<strong>Task Description:</strong> ${task.task_remark || "No Description Added"}<br>
<strong>Start Date:</strong> ${formattedFromDate}<br>
<strong>End Date:</strong> ${formattedEndDate}<br>
<strong>Category:</strong> ${categoryName}<br>
<strong>Priority:</strong> ${taskPriorityName}<br>
<strong>Status:</strong> ${taskStatusName}<br>
<strong>Type:</strong> ${taskTypeName}<br>
<strong>Days:</strong> ${selectedDaysNames || " "}
`
            });

        }

        if (messageHistoryData.length) {
            await TaskModelChatMessageHistory.bulkCreate(messageHistoryData);
        }
        return resSuccess({
            ack: 1,
            ack_msg: "Successfully imported",
            developer_msg: "Successfully imported",
            data: skippedRows.length
                ? `Skipped Rows: ${skippedRows.join(",")}`
                : ""
        });

    } catch (error) {

        console.log("addTaskByExcelSheet Error", error);

        return resError({
            ack_msg: "Unexpected error occurred during excel import.",
            developer_msg: error.message,
        });

    }
};