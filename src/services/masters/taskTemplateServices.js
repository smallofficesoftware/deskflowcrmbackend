import { Op } from "sequelize";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import {
    isValid,
    resError,
    resSuccess,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId, insertStagesAndStatusLogs } from "../commonServices.js";

import moment from "moment";
import Sequelize from "sequelize";
import { generateTimeBasedPrefixedUUID } from "../../helpers/uuidHelper.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { visitsModel } from "../../models/activities/visitModel.js";
import { taskTemplateModel } from "../../models/masters/taskTemplateModel.js";
import { taskTemplateDatasource } from "../../models/masters/taslTemplateDatasources.js";
import { sendMultipleNotification } from "../../services/company_setup/thirdPartyIntegrationService.js";
import { addWhatsappDispatchJobs } from "../whatsapp/whatsappService.js";
export const AllTaskDatasource = async (req, res) => {
    try {
        const { task_template_master_id } = req.body;

        if (!task_template_master_id) {
            return resError({
                ack: 0,
                ack_msg: "task_template_master_id is required",
                developer_msg: "Missing task_template_master_id in request body",
            });
        }

        const ids = Array.isArray(task_template_master_id)
            ? task_template_master_id
            : [task_template_master_id];

        // if (!ids.every(id => typeof id === 'number' && id > 0)) {
        //     return resError({
        //         ack: 0,
        //         ack_msg: "All task_template_master_id values must be positive numbers",
        //         developer_msg: "Invalid ID format in task_template_master_id",
        //     });
        // }

        const datavaluesModels = taskTemplateDatasource(req.tenantDB);

        const dataValues = await datavaluesModels.findAll({
            where: {
                task_template_master_id: ids,
                isDelete: 0,
            },
            order: [
                ['display_order', 'ASC'],
            ],
            attributes: ['task_template_master_id', "task_id", 'data_sorce', "display_order", "id", "notification_time_gap", "notification_time", "is_depend_on_previous_task"],
        });

        if (dataValues <= 0) {
            return resError({
                ack_msg: "No tasks added to this task template. Add tasks for this template.",
                developer_msg: "No data found for the given task_template_master_id",
            });
        }
        const formattedData = await Promise.all(
            dataValues.map(async (item) => {
                let parsedDataSorce = {};

                try {
                    parsedDataSorce = typeof item.data_sorce === 'string'
                        ? JSON.parse(item.data_sorce)
                        : item.data_sorce || {};
                } catch (error) {
                    parsedDataSorce = { original_value: item.data_sorce };
                }

                const taskId = item.task_id;

                let templateName = null;

                if (taskId) {
                    const taskManagementModels = taskManagementModel(req.tenantDB);

                    templateName = await taskManagementModels.findOne({
                        where: {
                            id: taskId,
                            isDelete: '0'
                        },
                        attributes: ["id", "task_title"]
                    })

                }

                return {
                    id: item.id,
                    task_template_master_id: item.task_template_master_id,
                    data_sorce: templateName,
                    display_order: item.display_order,
                    notification_time_gap: item.notification_time_gap,
                    notification_time: item.notification_time,
                    is_depend_on_previous_task: item.is_depend_on_previous_task,
                };
            })
        );

        return resSuccess({
            ack: 1,
            ack_msg: "Successfully fetched",
            developer_msg: "Data retrieved successfully",
            data: formattedData,
        });
    } catch (error) {
        console.error("Error in getTaskTemplateDatsource:", error);
        return resError({
            ack: 0,
            ack_msg: "Internal server error",
            developer_msg: error.message || "Unknown error",
        });
    }
};

export const StartAllWorkflow = async (req) => {
    try {
        const idsString = req.body.ids;
        const showOrderId = req.body.showOrderId;
        const setWorkFlowFor = req.body.setWorkFlowFor;
        const a_application_login_id = req.body.a_application_login_id;
        const task_template_master_id = req.body.task_template_master_id;
        const idsArray = idsString.split(",").map(id => id.trim()).filter(id => id);
        const todayDate = moment().format("YYYY-MM-DD");
        const todayDatetime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

        if (idsArray.length === 0) {
            return resError({ message: "No valid IDs provided" });
        }


        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const companyId = findCompanyId.company_masters_id;

        let cartDetails = null;
        let referanceTableName = "";
        let contactDetails = "";
        let daynamicCommonTaskTitle = "";
        let daynamicCommmonTaskRemark = "";

        const ContactModels = contactModel(req.tenantDB);

        if (setWorkFlowFor === "cart") {
            const cartModels = cartModel(req.tenantDB);


            cartDetails = await cartModels.findOne({
                where: {
                    id: showOrderId,
                    isDelete: 0
                },
                attributes: {
                    include: [
                        "id",
                        "cart_number",
                        "to_customer_id",
                        "type",
                        "country_id",
                        "state_id",
                        "city_id",
                        "area_id",
                        "Address",
                        "to_customer_company_name",
                        "to_customer_name",
                        "to_customer_email",
                        "to_customer_phone",
                        "pincode",


                        [
                            Sequelize.literal(
                                "(SELECT a_countries.country_name FROM a_countries WHERE a_countries.id = carts.country_id AND a_countries.isDelete = 0)"
                            ),
                            "country_name"
                        ],


                        [
                            Sequelize.literal(
                                "(SELECT a_states.state_name FROM a_states WHERE a_states.id = carts.state_id AND a_states.isDelete = 0)"
                            ),
                            "state_name"
                        ],

                        // 🔹 City Name
                        [
                            Sequelize.literal(
                                "(SELECT a_cities.city_name FROM a_cities WHERE a_cities.id = carts.city_id AND a_cities.isDelete = 0)"
                            ),
                            "city_name"
                        ],

                        // 🔹 Area Name
                        [
                            Sequelize.literal(
                                "(SELECT a_areas.area_name FROM a_areas WHERE a_areas.id = carts.area_id AND a_areas.isDelete = 0)"
                            ),
                            "area_name"
                        ]
                    ]
                },
                raw: true
            });
            //Contact Details
            contactDetails = await ContactModels.findOne({
                where: {
                    id: cartDetails.to_customer_id,
                    isDelete: 0
                },
                attributes: [
                    "id",
                    "person_name",
                    "company_name",
                    "mobile_number",
                    "client_code",
                    "email_id",
                    "country",
                    "state",
                    "city",
                    "area",
                    "address",
                    "pincode",
                ],
                raw: true
            });

            const namePart = cartDetails.to_customer_name
                ? cartDetails.to_customer_name
                : cartDetails.to_customer_company_name || "";

            const commonContactPart = `${namePart} ${cartDetails.to_customer_phone || ""}`.trim();

            daynamicCommonTaskTitle = commonContactPart;

            daynamicCommmonTaskRemark = [
                "Contact Details",
                cartDetails.to_customer_name ? `Name: ${cartDetails.to_customer_name}` : "",
                cartDetails.to_customer_company_name ? `Company: ${cartDetails.to_customer_company_name}` : "",
                cartDetails.to_customer_phone ? `Mobile: ${cartDetails.to_customer_phone}` : "",
                contactDetails?.client_code ? `Client Code: ${contactDetails.client_code}` : "",
                cartDetails.to_customer_email ? `Email: ${cartDetails.to_customer_email}` : "",
                cartDetails.Address ? `Address: ${cartDetails.Address}` : "",
                cartDetails.country_name ? `Country: ${cartDetails.country_name}` : "",
                cartDetails.state_name ? `State: ${cartDetails.state_name}` : "",
                cartDetails.city_name ? `City: ${cartDetails.city_name}` : "",
                cartDetails.area_name ? `Area: ${cartDetails.area_name}` : "",
                cartDetails.pincode ? `Pincode: ${cartDetails.pincode}` : ""
            ]
                .filter(Boolean)
                .join("\n")
                .trim();

            let backName = cartDetails.type == 1 ? "quotation" :
                cartDetails.type == 2 ? "order" :
                    cartDetails.type == 3 ? "invoice" :
                        cartDetails.type == 4 ? "purchase_order" :
                            cartDetails.type == 5 ? "order_purchase" :
                                cartDetails.type == 6 ? "return_sales_invoice" :
                                    cartDetails.type == 7 ? "return_purchase_invoice" :
                                        cartDetails.type == 8 ? "inward" :
                                            cartDetails.type == 9 ? "dispatch" :
                                                "";

            referanceTableName = `cart_${backName}`;
        } else if (setWorkFlowFor === "Contact") {
            // const ContactModels = contactModel(req.tenantDB);
            cartDetails = await ContactModels.findOne({
                where: {
                    id: showOrderId,
                    isDelete: 0
                },
                attributes: [
                    "id",
                    "person_name",
                    "company_name",
                    "mobile_number",
                    "client_code",
                    "email_id",
                    "country",
                    "state",
                    "city",
                    "area",
                    "address",
                    "pincode",
                    ['id', 'to_customer_id'],

                    // Country Name
                    [
                        Sequelize.literal(
                            `(SELECT a_countries.country_name FROM a_countries WHERE a_countries.id = contact_masters.country AND a_countries.isDelete = 0)`
                        ),
                        "country_name"
                    ],

                    // State Name
                    [
                        Sequelize.literal(
                            `(SELECT a_states.state_name FROM a_states WHERE a_states.id = contact_masters.state AND a_states.isDelete = 0)`
                        ),
                        "state_name"
                    ],

                    // City Name
                    [
                        Sequelize.literal(
                            `(SELECT a_cities.city_name FROM a_cities WHERE a_cities.id = contact_masters.city AND a_cities.isDelete = 0)`
                        ),
                        "city_name"
                    ],

                    // Area Name
                    [
                        Sequelize.literal(
                            `(SELECT a_areas.area_name FROM a_areas WHERE a_areas.id = contact_masters.area AND a_areas.isDelete = 0)`
                        ),
                        "area_name"
                    ]
                ],
                raw: true
            });
            const namePart = cartDetails.person_name
                ? cartDetails.person_name
                : cartDetails.company_name || "";

            const commonContactPart = `${namePart} ${cartDetails.mobile_number || ""}`.trim();

            daynamicCommonTaskTitle = commonContactPart;

            daynamicCommmonTaskRemark = [
                "Contact Details",
                cartDetails.person_name ? `Name: ${cartDetails.person_name}` : "",
                cartDetails.company_name ? `Company: ${cartDetails.company_name}` : "",
                cartDetails.mobile_number ? `Mobile: ${cartDetails.mobile_number}` : "",
                cartDetails?.client_code ? `Client Code: ${cartDetails.client_code}` : "",
                cartDetails.email_id ? `Email: ${cartDetails.email_id}` : "",
                cartDetails.address ? `Address: ${cartDetails.address}` : "",
                cartDetails.country_name ? `Country: ${cartDetails.country_name}` : "",
                cartDetails.state_name ? `State: ${cartDetails.state_name}` : "",
                cartDetails.city_name ? `City: ${cartDetails.city_name}` : "",
                cartDetails.area_name ? `Area: ${cartDetails.area_name}` : "",
                cartDetails.pincode ? `Pincode: ${cartDetails.pincode}` : ""
            ]
                .filter(Boolean)
                .join("\n")
                .trim();



            referanceTableName = `contact_masters`;
        } else if (setWorkFlowFor === "Inquiry") {
            const inquiryModels = inquiryModel(req.tenantDB)
            cartDetails = await inquiryModels.findOne({
                where: {
                    id: showOrderId,
                    isDelete: 0
                },
                attributes: [
                    "id",
                    "contact_master_id",
                    "qty",
                    "category_id",
                    "product_id",
                    "description",
                    ['contact_master_id', 'to_customer_id'],
                ],
                raw: true
            });
            contactDetails = await ContactModels.findOne({
                where: {
                    id: cartDetails.contact_master_id,
                    isDelete: 0
                },
                attributes: [
                    "id",
                    "person_name",
                    "company_name",
                    "mobile_number",
                    "client_code",
                    "email_id",
                    "country",
                    "state",
                    "city",
                    "area",
                    "address",
                    "pincode",
                    // Country Name
                    [
                        Sequelize.literal(`
                (SELECT country_name
                 FROM a_countries
                 WHERE a_countries.id = contact_masters.country
                 AND a_countries.isDelete = 0)
            `),
                        "country_name"
                    ],

                    // State Name
                    [
                        Sequelize.literal(`
                (SELECT state_name
                 FROM a_states
                 WHERE a_states.id = contact_masters.state
                 AND a_states.isDelete = 0)
            `),
                        "state_name"
                    ],

                    // City Name
                    [
                        Sequelize.literal(`
                (SELECT city_name
                 FROM a_cities
                 WHERE a_cities.id = contact_masters.city
                 AND a_cities.isDelete = 0)
            `),
                        "city_name"
                    ],

                    // Area Name
                    [
                        Sequelize.literal(`
                (SELECT area_name
                 FROM a_areas
                 WHERE a_areas.id = contact_masters.area
                 AND a_areas.isDelete = 0)
            `),
                        "area_name"
                    ]
                ],
                raw: true
            });

            const namePart = contactDetails.person_name
                ? contactDetails.person_name
                : contactDetails.company_name || "";

            const commonContactPart = `${namePart} ${contactDetails.mobile_number || ""}`.trim();

            daynamicCommonTaskTitle = commonContactPart;
            const inquryDescreplace = cartDetails.description;
            const inquiryDescription = inquryDescreplace.replace(/<[^>]+>/g, '');
            daynamicCommmonTaskRemark = [
                "Contact Details",
                inquiryDescription ? `Inquiry Remark: ${inquiryDescription}` : "",
                contactDetails.person_name ? `Name: ${contactDetails.person_name}` : "",
                contactDetails.company_name ? `Company: ${contactDetails.company_name}` : "",
                contactDetails.mobile_number ? `Mobile: ${contactDetails.mobile_number}` : "",
                contactDetails.client_code ? `Client Code: ${contactDetails.client_code}` : "",
                contactDetails.email_id ? `Email: ${contactDetails.email_id}` : "",
                contactDetails.address ? `Address: ${contactDetails.address}` : "",
                contactDetails.country_name ? `Country: ${contactDetails.country_name}` : "",
                contactDetails.state_name ? `State: ${contactDetails.state_name}` : "",
                contactDetails.city_name ? `City: ${contactDetails.city_name}` : "",
                contactDetails.area_name ? `Area: ${contactDetails.area_name}` : "",
                contactDetails.pincode ? `Pincode: ${contactDetails.pincode}` : ""
            ]
                .filter(Boolean)
                .join("\n")
                .trim();



            referanceTableName = `inquiries`;
        } else if (setWorkFlowFor === "Visit") {
            const visitModels = visitsModel(req.tenantDB)
            cartDetails = await visitModels.findOne({
                where: {
                    id: showOrderId,
                    isDelete: 0
                },
                attributes: [
                    "id",
                    "remark",
                    "contact_id",
                    ['contact_id', 'to_customer_id'],
                ],
                raw: true
            });
            contactDetails = await ContactModels.findOne({
                where: {
                    id: cartDetails.contact_id,
                    isDelete: 0
                },
                attributes: [
                    "id",
                    "person_name",
                    "company_name",
                    "mobile_number",
                    "client_code",
                    "email_id",
                    "country",
                    "state",
                    "city",
                    "area",
                    "address",
                    "pincode",

                    // Country Name
                    [
                        Sequelize.literal(`
                (SELECT country_name
                 FROM a_countries
                 WHERE a_countries.id = contact_masters.country
                 AND a_countries.isDelete = 0)
            `),
                        "country_name"
                    ],

                    // State Name
                    [
                        Sequelize.literal(`
                (SELECT state_name
                 FROM a_states
                 WHERE a_states.id = contact_masters.state
                 AND a_states.isDelete = 0)
            `),
                        "state_name"
                    ],

                    // City Name
                    [
                        Sequelize.literal(`
                (SELECT city_name
                 FROM a_cities
                 WHERE a_cities.id = contact_masters.city
                 AND a_cities.isDelete = 0)
            `),
                        "city_name"
                    ],

                    // Area Name
                    [
                        Sequelize.literal(`
                (SELECT area_name
                 FROM a_areas
                 WHERE a_areas.id = contact_masters.area
                 AND a_areas.isDelete = 0)
            `),
                        "area_name"
                    ]
                ],
                raw: true
            });

            const namePart = contactDetails.person_name
                ? contactDetails.person_name
                : contactDetails.company_name || "";

            const commonContactPart = `${namePart} ${contactDetails.mobile_number || ""}`.trim();

            daynamicCommonTaskTitle = commonContactPart;
            const visitDescreplace = cartDetails.remark;
            const visitDescription = visitDescreplace.replace(/<[^>]+>/g, '');
            daynamicCommmonTaskRemark = [
                "Contact Details",
                visitDescription ? `Visit Remark: ${visitDescription}` : "",
                contactDetails.person_name ? `Name: ${contactDetails.person_name}` : "",
                contactDetails.company_name ? `Company: ${contactDetails.company_name}` : "",
                contactDetails.mobile_number ? `Mobile: ${contactDetails.mobile_number}` : "",
                contactDetails.client_code ? `Client Code: ${contactDetails.client_code}` : "",
                contactDetails.email_id ? `Email: ${contactDetails.email_id}` : "",
                contactDetails.address ? `Address: ${contactDetails.address}` : "",
                contactDetails.country_name ? `Country: ${contactDetails.country_name}` : "",
                contactDetails.state_name ? `State: ${contactDetails.state_name}` : "",
                contactDetails.city_name ? `City: ${contactDetails.city_name}` : "",
                contactDetails.area_name ? `Area: ${contactDetails.area_name}` : "",
                contactDetails.pincode ? `Pincode: ${contactDetails.pincode}` : ""
            ]
                .filter(Boolean)
                .join("\n")
                .trim();
            referanceTableName = `visits`;
        }

        /* Get templace task detail */
        const taskManagementModels = await taskManagementModel(req.tenantDB);
        const taskTemplateDatasourceInstance = await taskTemplateDatasource(req.tenantDB);
        const getTemplateTaskDb = await taskManagementModels.findAll({ where: { isDelete: '0', id: idsArray } });
        const taskTemplateDetailDb = await taskTemplateDatasourceInstance.findAll({ where: { isDelete: 0, task_template_master_id }, attributes: ["notification_time_gap", "notification_time", "task_id", "is_depend_on_previous_task", "id", "task_template_master_id", "display_order"], raw: true })
        const taskTemplateDayGapDetailTaskWise = isValid(taskTemplateDetailDb)
            ? [
                taskTemplateDetailDb.reduce((acc, v) => {
                    acc[v.task_id] = v.notification_time_gap;
                    return acc;
                }, {})
            ]
            : [];
        const taskTemplateTimeGapDetailTaskWise = isValid(taskTemplateDetailDb)
            ? [
                taskTemplateDetailDb.reduce((acc, v) => {
                    acc[v.task_id] = v.notification_time;
                    return acc;
                }, {})
            ]
            : [];

        const taskTemplateIsDepenedDetailTaskWise = isValid(taskTemplateDetailDb)
            ? [
                taskTemplateDetailDb.reduce((acc, v) => {
                    acc[v.task_id] = v.is_depend_on_previous_task;
                    return acc;
                }, {})
            ]
            : [];

        const taskTemplateIDDetailTaskWise = isValid(taskTemplateDetailDb)
            ? [
                taskTemplateDetailDb.reduce((acc, v) => {
                    acc[v.task_id] = v.id;
                    return acc;
                }, {})
            ]
            : [];
        const taskTemplateMasterIdDetailTaskWise = isValid(taskTemplateDetailDb)
            ? [
                taskTemplateDetailDb.reduce((acc, v) => {
                    acc[v.task_id] = v.task_template_master_id;
                    return acc;
                }, {})
            ]
            : [];
        const taskTemplateDisplayOrderDetailTaskWise = isValid(taskTemplateDetailDb)
            ? [
                taskTemplateDetailDb.reduce((acc, v) => {
                    acc[v.task_id] = v.display_order;
                    return acc;
                }, {})
            ]
            : [];
        const generateUniqNumber = generateTimeBasedPrefixedUUID(`Template_${task_template_master_id}`)
        const insertTaskArray = await Promise.all(
            getTemplateTaskDb.map((v) => {
                const taskGap = taskTemplateDayGapDetailTaskWise[0][v.id];
                const taskTimeGap = taskTemplateTimeGapDetailTaskWise[0][v.id];
                const isDependedOnPreviousTask = taskTemplateIsDepenedDetailTaskWise[0][v.id];
                const TaskTemplateDataSourceId = taskTemplateIDDetailTaskWise[0][v.id];
                const TaskTemplateMasterId = taskTemplateMasterIdDetailTaskWise[0][v.id];
                const displayOrder = taskTemplateDisplayOrderDetailTaskWise[0][v.id];
                let taskData = todayDate
                let time = "00:00";
                let isNotVisible = 0;
                if (taskGap) {
                    taskData = moment(taskData).add(taskGap, "days").format("YYYY-MM-DD");
                }
                if (taskTimeGap) {
                    time = taskTimeGap;
                }
                if (isDependedOnPreviousTask == 1) {
                    isNotVisible = 1;
                }
                taskData = moment(
                    `${taskData} ${time}`,
                    "YYYY-MM-DD HH:mm:ss"
                ).format("YYYY-MM-DD HH:mm:ss");

                let task_title = `${v.task_title} ${cartDetails?.cart_number || ''} ${daynamicCommonTaskTitle}`.trim();
                if (v.is_notification_sand_wp == 1 || v.is_notification_sand_email == 1) {
                    task_title = v.task_title;
                }

                let task_remark = `${v.task_remark}\n\n${cartDetails?.cart_number ? 'Cart No: ' + cartDetails.cart_number : ''}\n${daynamicCommmonTaskRemark}`.trim();
                if (v.is_notification_sand_wp == 1 || v.is_notification_sand_email == 1) {
                    task_remark = v.task_remark;
                }
                return {
                    task_title: task_title,
                    task_category_id: v.task_category_id,
                    task_priority: v.task_priority,
                    team_task_assignement_type: v.team_task_assignement_type,
                    task_type: '5',
                    task_selected_date: v.task_selected_date,
                    selected_task_days: v.selected_task_days,
                    assigned_team_member: v.assigned_team_member,
                    task_fromdate: taskData,
                    task_enddate: taskData,
                    task_remark: task_remark,
                    task_template: '0',
                    status: "-3",
                    is_archive: v.is_archive,
                    reference_table: referanceTableName,
                    reference_id: cartDetails?.id,
                    contact_masters_id: cartDetails?.to_customer_id,
                    a_application_login_id: v.a_application_login_id,
                    company_masters_id: v.company_masters_id,
                    task_attechment: v.task_attechment,
                    is_notification_sand_wp: v.is_notification_sand_wp,
                    is_notification_sand_email: v.is_notification_sand_email,
                    completed_date: v.completed_date,
                    complated_by: v.complated_by,
                    modify_date: v.modify_date,
                    modify_by: v.modify_by,
                    created_date_time: todayDatetime,
                    is_auto_create: '1',
                    is_not_visible: isNotVisible,
                    task_template_data_source_id: TaskTemplateDataSourceId,
                    task_template_data_id: TaskTemplateMasterId,
                    grouped_task_unque_key: generateUniqNumber,
                    template_seq_no: displayOrder
                }
            })
        )

        const insertedTask = await taskManagementModels.bulkCreate(insertTaskArray);
        const taskIdMap = insertedTask.map(v => v.id);
        /* Get templace task detail */

        await Promise.all(
            insertedTask.map(async (v) => {
                const promises = [];

                // Status log
                /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
                promises.push(
                    insertStagesAndStatusLogs(req, {
                        reference_table: "task_managements",
                        reference_id: v.id,
                        status_id: "-3",
                        a_application_login_id: a_application_login_id,
                    })
                );
                /* Status Log Entry Added BY Dinesh -> 20-11-2025 */

                // WhatsApp job
                /* Whatsapp dispatch jobs entry - Added by dinesh 27-04-2026 */
                if (v.is_notification_sand_email == 1 || v.is_notification_sand_wp == 1) {
                    req.body.whatspp_dispatch_jobs_type = v.is_notification_sand_wp == 1 ? 1 : 2;
                    req.body.whatspp_dispatch_jobs_company_id = findCompanyId.company_masters_id;
                    promises.push(addWhatsappDispatchJobs(req));
                }
                /* Whatsapp dispatch jobs entry - Added by dinesh 27-04-2026 */

                return Promise.all(promises);
            })
        );

        const getTaskTeamMemberIds = await taskManagementModels.findAll({
            where: {
                isDelete: 0,
                id: {
                    [Op.in]: taskIdMap
                }
            },
            attributes: ["assigned_team_member"]
        });


        const allAssignedMemberIds = new Set();

        getTaskTeamMemberIds.forEach(task => {
            if (task.assigned_team_member) {
                const memberIds = task.assigned_team_member
                    .split(",")
                    .map(id => id.trim())
                    .filter(id => id);

                memberIds.forEach(id => allAssignedMemberIds.add(id));
            }
        });


        if (allAssignedMemberIds.size > 0) {
            const assignedMemberIdsArray = Array.from(allAssignedMemberIds);

            try {
                const assignedMembers = await loginModel.findAll({
                    where: {
                        id: assignedMemberIdsArray,
                        isDelete: 0,
                    },
                    attributes: ["id", "username", "web_refresh_token", "android_refresh_token", "ios_refresh_token"],
                });


                const allTokens = assignedMembers
                    .flatMap((member) => [
                        member.web_refresh_token,
                        member.android_refresh_token,
                        member.ios_refresh_token,
                    ])
                    .filter((token) => token && token.trim() !== "");

                const uniqueTokens = [...new Set(allTokens)];

                if (uniqueTokens.length > 0) {
                    const assigner = await loginModel.findOne({
                        where: {
                            id: a_application_login_id,
                            isDelete: 0,
                        },
                        attributes: ["username"],
                    });

                    const assignerName = assigner?.username || "Someone";

                    await sendMultipleNotification({
                        deviceTokens: uniqueTokens,
                        title: `${assignerName} has assigned you new task(s)`,
                        body: `You have been assigned to new task(s)`,
                    });

                } else {
                    console.log("No device tokens found for assigned team members.");
                }
            } catch (notificationError) {
                console.error("Notification failed (non-critical):", notificationError.message);
            }
        } else {
            console.log("No assigned team members found.");
        }

        return resSuccess({
            ack_msg: "Tasks Created successfully",
        });

    } catch (e) {
        console.log("Error in StartAllWorkflow:", e);
        return resError({
            message: "Failed to start workflow",
            error: e.message
        });
    }
}

export const DeleteTasktemplate = async (req) => {
    try {
        const id = req.body.id
        const idsArray = id.split(",").map(id => id.trim()).filter(id => id);

        const taskTemplateModels = taskTemplateModel(req.tenantDB)

        const deleteTemplate = await taskTemplateModels.update({
            isDelete: 1
        },
            {
                where: {
                    id: {
                        [Op.in]: idsArray
                    },
                }
            }
        )

        const taskTemplateDatasourceModels = taskTemplateDatasource(req.tenantDB)
        const deleteTemplateDataSource = await taskTemplateDatasourceModels.update({ isDelete: 1 },
            {
                where: {
                    task_template_master_id: {
                        [Op.in]: idsArray
                    },
                }
            })

        const taskMasterModels = await taskManagementModel(req.tenantDB)
        const updateTaskMasterData = await taskMasterModels.update({
            task_template: 0
        },
            {
                where: {
                    task_template: {
                        [Op.in]: idsArray
                    }
                }
            })


        return resSuccess({
            ack_msg: "Delete successfully",
            developer_msg: "Delete Successfully"
        })
    }
    catch (e) {
        console.error("error on DeleteTaskTemplate (taskTemplateServices.js) ", e)
        return resError({
            developer_msg: `error on DeleteTaskTemplate (taskTemplateServices.js) ${e}`
        })
    }
}