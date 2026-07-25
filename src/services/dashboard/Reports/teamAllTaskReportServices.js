import moment from "moment";
import { Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import { taskManagementModel } from "../../../models/activities/taskManagementModel.js";
import { stagestatusModel } from "../../../models/masters/stagestatusModel.js";
import { taskCategoryModel } from "../../../models/masters/taskCategoryModel.js";
import { customFieldFormModel } from "../../../models/other_settings/customFieldFormModel.js";
import { getCompanyByLoginId, getLoginDetailById } from "../../../services/commonServices.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
export const getTeamTaskReport = async (req) => {
    try {
        const { a_application_login_id, ll, ul, is_support_ticket_flag, selectedContactId, referenceWiseContact } = req.body
        const selectedDates = req.body.selectedDates || [];
        const selectedTeamMembers = req.body.selectedTeamMembers;
        const selectedStageStatus = req.body.selectedStageStatus;
        const globalSearch = req.body.globalSearch?.trim() || "";

        if (!Array.isArray(selectedDates) || selectedDates.length !== 2) {
            return resError({
                ack_msg: "Invalid date range",
                developer_msg: "selectedDates must be an array with exactly 2 dates"
            });
        }

        let startDate, endDate;
        try {
            startDate = moment(selectedDates[0]).isValid()
                ? moment(selectedDates[0]).startOf('day').format('YYYY-MM-DD')
                : null;
            endDate = moment(selectedDates[1]).isValid()
                ? moment(selectedDates[1]).endOf('day').format('YYYY-MM-DD')
                : null;

            if (!startDate || !endDate) throw new Error("Invalid date format");
        } catch (error) {
            return resError({
                ack_msg: "Invalid date format",
                developer_msg: error.message
            });
        }

        let fullTextSearchCondition = {};
        if (globalSearch) {
            const cartColumns = Object.keys(taskManagementModel(req.tenantDB).rawAttributes)
                .filter(col => {
                    const attr = taskManagementModel(req.tenantDB).rawAttributes[col];
                    return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
                });

            const like = `%${globalSearch}%`;
            const orConditions = cartColumns.map(col => ({
                [col]: { [Op.like]: like }
            }));

            fullTextSearchCondition = { [Op.or]: orConditions };
        }
        let dateFilter = {};
        let andConditions = [];

        if (selectedDates.length === 2) {

            andConditions.push(
                Sequelize.where(
                    Sequelize.fn("DATE", Sequelize.col("task_fromdate")),
                    {
                        [Op.between]: [startDate, endDate]
                    }
                )
            );
        }
        const limit = Math.min(Math.max(parseInt(ll) || 10, 1), 1000); // Max 1000 records
        const offset = Math.max(parseInt(ul) || 0, 0);

        if (offset > 1000000) { // Prevent DOS
            return resError({
                ack_msg: "Offset too large",
                developer_msg: "Maximum offset allowed is 1,000,000"
            });
        }

        const findCompanyid = await getCompanyByLoginId(a_application_login_id);

        if (!findCompanyid) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "Unable to fetch company details"
            });
        }

        let whereClause = {
            isDelete: 0,
            company_masters_id: findCompanyid.company_masters_id,
        };

        // if (req.body.is_support_ticket_flag === 0) {
        //     whereClause.is_support_ticket = 0;
        // }
        // else if (req.body.is_support_ticket_flag === 1) {
        //     whereClause.is_support_ticket = 1;
        // }
        const a_application_login_type_rights = req.body.a_application_login_id;
        const { showAllData, showPersonalData } = await getUserRights({
            company_masters_id: findCompanyid.company_masters_id,
            a_application_login_id: a_application_login_type_rights,
            page_id: PAGE_ID.ALLTASK_REPORT,
            tenentId: req.tenantDB
        });

        if (showPersonalData) {
            const userId = parseInt(req.body.a_application_login_id, 10);

            andConditions.push({
                [Op.or]: [
                    { a_application_login_id: userId },
                    Sequelize.literal(`FIND_IN_SET(${userId}, assigned_team_member)`)
                ]
            });
        }
        else if (showPersonalData) {
            const userId = req.body.a_application_login_id;

            whereClause = {
                [Op.or]: [
                    { a_application_login_id: userId },
                    Sequelize.literal(`FIND_IN_SET(${userId}, assigned_team_member)`)
                ]
            };
        }

        if (req.body.is_support_ticket_flag === 0) {
            whereClause.is_support_ticket = 0;
        }
        else if (req.body.is_support_ticket_flag === 1) {
            whereClause.is_support_ticket = 1;
        }
        if (selectedContactId && referenceWiseContact == 1) {

            whereClause.contact_masters_id = selectedContactId;

        }
        else if (selectedContactId && referenceWiseContact == 2) {

            const Contact = contactModel(req.tenantDB);

            const findreffrancewiseContact = await Contact.findAll({
                where: {
                    referance_contact: selectedContactId,
                    isDelete: 0,
                },
                attributes: ["id"],
                raw: true,
            });

            const contactIds = findreffrancewiseContact.map(item => item.id);

            if (contactIds.length === 0) {
                return resSuccess({
                    data: { data: [] },
                    ack_msg: "No Data Found",
                    developer_msg: "No reference contacts found"
                });
            }

            whereClause.contact_masters_id = {
                [Op.in]: contactIds,
            };
        }

        const statusModels = stagestatusModel(req.tenantDB)
        const statusData = await statusModels.findAll({
            where: {
                isDelete: 0,
                order_type: 8
            },
            attributes: ["id", "name", "color", "visibility"],
        })
        console.log("huhiohiohiohiojho", statusData);


        const internalIds = [];
        const externalIds = [];

        for (const id of selectedStageStatus) {

            const statusObj = statusData.find(
                x => Number(x.id) === Number(id)
            );

            if (!statusObj) continue;

            if (statusObj.visibility == 1) {
                externalIds.push(id);
            } else {
                internalIds.push(id);
            }
        }
        const stageConditions = [];

        if (internalIds.length > 0) {
            stageConditions.push(
                `(${internalIds
                    .map(id => `FIND_IN_SET(${id}, status)`)
                    .join(" OR ")})`
            );
        }

        if (externalIds.length > 0) {
            stageConditions.push(
                `(${externalIds
                    .map(id => `FIND_IN_SET(${id}, external_status)`)
                    .join(" OR ")})`
            );
        }

        if (stageConditions.length > 0) {
            andConditions.push(
                Sequelize.literal(stageConditions.join(" AND "))
            );
        }
        if (
            Array.isArray(selectedTeamMembers) &&
            selectedTeamMembers.length > 0
        ) {

            const safeIds = selectedTeamMembers
                .map(id => parseInt(id, 10))
                .filter(id => !isNaN(id));

            if (safeIds.length > 0) {

                const findConditions = safeIds
                    .map(id => `FIND_IN_SET(${id}, assigned_team_member)`)
                    .join(" OR ");

                andConditions.push(
                    Sequelize.literal(`(${findConditions})`)
                );
            }
        }
        const companyId = findCompanyid.company_masters_id;

        const taskMasterModels = taskManagementModel(req.tenantDB)

        const finalWhere = {
            ...whereClause,
            ...fullTextSearchCondition,
        };

        if (andConditions.length > 0) {
            finalWhere[Op.and] = andConditions;
        }

        const taskMasterData = await taskMasterModels.findAll({
            where: finalWhere,

            order: [["id", "DESC"]],
            offset, // ll -> offset
            limit,  // ul -> limit

        })
        console.log("Sdfsfsfsfsf", taskMasterData)

        const dynamicFormType =
            req.body.is_support_ticket_flag == 0 ? 14 : 15;

        const CustomFormFeildsTaskOrSupport = await customFieldFormModel(req.tenantDB).findAll({
            where: {
                form_type: dynamicFormType,
                isDelete: 0,
                report_print_or_not: 1,
                data_type: { [Op.ne]: 11 },
            },
            raw: true,
        });



        const taskCategoryModels = taskCategoryModel(req.tenantDB)
        const categoryData = await taskCategoryModels.findAll({
            where: {
                isDelete: 0,
                company_masters_id: companyId,

            },
            attributes: ["task_category_name", "id", "task_color"]
        })

        const taskTypesList = [
            { id: "1", type_name: "Daily" },
            { id: "2", type_name: "Weekly" },
            { id: "3", type_name: "Monthly" },
            { id: "4", type_name: "Yearly" },
            { id: "5", type_name: "Once" },
        ];

        const taskPriorityList = [
            { id: "1", mode_name: "Low" },
            { id: "2", mode_name: "Medium" },
            { id: "3", mode_name: "High" },
            { id: "4", mode_name: "Critical" },
        ];

        const selectWeeklyDays = [
            { id: "1", days_name: "Monday" },
            { id: "2", days_name: "Tuesday" },
            { id: "3", days_name: "Wednesday" },
            { id: "4", days_name: "Thursday" },
            { id: "5", days_name: "Friday" },
            { id: "6", days_name: "Saturday" },
            { id: "7", days_name: "Sunday" },
        ];

        const dayIdToNameMap = selectWeeklyDays.reduce((acc, day) => {
            acc[day.id] = day.days_name;
            return acc;
        }, {});

        const tasks = await Promise.all(taskMasterData.map(async (task) => {
            const statusItem = statusData.find((s) => s.id == task.status);
            const externalstatusItem = statusData.find((s) => s.id == task.external_status);
            const categoryItem = categoryData.find((s) => s.id === task.task_category_id);
            const priorityItem = taskPriorityList.find((s) => s.id === String(task.task_priority)); // ✅ Convert to string
            const typeItem = taskTypesList.find((s) => s.id === String(task.task_type));

            //  const selectedDaysItem = selectWeeklyDays.find((s) => s.id === task.selected_task_days);

            let selectedDaysNames = [];
            if (task.selected_task_days) {
                const dayIds = task.selected_task_days
                    .split(',')
                    .map(id => id.trim())
                    .filter(id => id && dayIdToNameMap[id]);

                selectedDaysNames = dayIds.map(id => dayIdToNameMap[id]);
            }


            /* assigned Name Get */
            let assignedNames = [];
            if (task.assigned_team_member) {
                const ids = task.assigned_team_member.split(',').map(id => id.trim()).filter(id => id);
                console.log("idsidsidsids", ids);

                assignedNames = await Promise.all(
                    ids.map(async (id) => {
                        const user = await getLoginDetailById(id);
                        console.log("useruser", user);

                        return user?.username || `ID ${id}`;
                    })
                );
            }




            /* Created By name */
            let createdByName = "";

            if (task.a_application_login_id) {
                const createdUser = await getLoginDetailById(task.a_application_login_id);
                createdByName = createdUser?.username || "";
            }
            let customForm = [];

            if (
                Array.isArray(CustomFormFeildsTaskOrSupport) &&
                CustomFormFeildsTaskOrSupport.length > 0
            ) {

                customForm = CustomFormFeildsTaskOrSupport.map((field) => {

                    let fieldValue = "";

                    // check reference column exists in task row
                    if (
                        field.reference_column_name &&
                        Object.prototype.hasOwnProperty.call(
                            task.dataValues,
                            field.reference_column_name
                        )
                    ) {
                        fieldValue =
                            task.dataValues[field.reference_column_name];
                    }

                    return {
                        id: field.id,
                        a_application_login_id:
                            field.a_application_login_id,

                        company_masters_id:
                            field.company_masters_id,

                        title: field.title,

                        reference_column_name:
                            field.reference_column_name,
                        data_type: field.data_type,
                        value: fieldValue || "",
                    };
                });
            }

            return {
                ...task.dataValues,
                status_name: statusItem ? statusItem.name : "",
                status_colour: statusItem ? statusItem.color : "",
                external_status_name: externalstatusItem ? externalstatusItem.name : "",
                external_status_colour: externalstatusItem ? externalstatusItem.color : "",
                assigned_team_member_names: assignedNames ? assignedNames : "",
                category_name: categoryItem ? categoryItem.task_category_name : "",
                category_colour: categoryItem ? categoryItem.task_color : "",
                priority_name: priorityItem ? priorityItem.mode_name : "",
                type_name: typeItem ? typeItem.type_name : "",
                selected_days_names: selectedDaysNames ? selectedDaysNames : "",
                created_by_name: createdByName,
                customForm: customForm,
            };
        }));

        return resSuccess({
            data: { data: tasks },
            ack_msg: "Successfully get Data",
            developer_msg: "successfully get"
        })
    }
    catch (e) {
        console.log("eeeeeeeeeeeeeeeeeeeeeeeeeeee", e);
        return resError({
            developer_msg: e
        })

    }
}