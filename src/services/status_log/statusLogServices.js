import { Op } from "sequelize";
import { getTenantDB } from "../../config/dbManager.js";
import loginModel from "../../models/application_login/loginModel.js";
import { statusAndStagesLogsModel } from "../../models/common/statusAndStagesLogsModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { WEBSITE_LEAD_HANDLE_DB_NAME } from "../../utils/appConstants.js";
import { formatDateAndTimeCreateDateTimeV2, isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const getStatusLog = async (req, res) => {
    try {
        const { reference_table, reference_id, table_type } = req.body;
        if (isValid(reference_table) && isValid(reference_id)) {

            const a_application_login_id = req.body.a_application_login_id;

            const findCompanyId = await getCompanyByLoginId(
                a_application_login_id
            );

            const statusAndStagesLogsModelIntance = statusAndStagesLogsModel(req.tenantDB);
            const stagestatusModelInstance = stagestatusModel(req.tenantDB)
            const getDBStatusLogList = await statusAndStagesLogsModelIntance.findAll(
                {
                    where: {
                        isDelete: '0',
                        reference_table,
                        reference_id
                    },
                    raw: true,
                    attributes: ["reference_table", "reference_id", "information", "status_id", "previous_status_id", "updated_by", "updated_date_time"],
                    order: [["updated_date_time", "DESC"]]
                }
            );

            const stageAndStatusMasterTableReference = {
                "contact_masters": 1,
                "inquiries": 2,
                "cart_quotation": 3,
                "cart_order": 4,
                "cart_invoice": 5,
                "cart_purchase_order": 6,
                "cart_order_purchase": 7,
                "task_managements": 8,
                "cart_return_sales_invoice": 9,
                "cart_return_purchase_invoice": 10,
                "cart_inward": 12,
                "cart_dispatch": 11,
            }

            const getStageAndStatus = await stagestatusModelInstance.findAll({
                where: {
                    isDelete: 0, order_type: stageAndStatusMasterTableReference[table_type ? table_type : reference_table]
                },
                raw: true,
                attributes: ["name", "color", "id"]
            })
            const stageAndStatusNameMap = new Map(getStageAndStatus.map((e) => [String(e.id), e.name]));
            const stageAndStatusColorMap = new Map(getStageAndStatus.map((e) => [String(e.id), e.color]));

            const finalList = await Promise.all(
                getDBStatusLogList.map(async (v) => {
                    const dbUpdatedBy = await loginModel.findOne(
                        {
                            where: {
                                isDelete: 0,
                                id: v.updated_by
                            },
                            raw: true,
                            attributes: ["username"]
                        }
                    )
                    return {
                        ...v,
                        updated_date_time: v.updated_date_time ? formatDateAndTimeCreateDateTimeV2(v.updated_date_time) : "",
                        status_color_code: stageAndStatusColorMap.get(String(v.status_id)) || "",
                        status_name: stageAndStatusNameMap.get(String(v.status_id)) || "",
                        updated_by_name: isValid(dbUpdatedBy) ? dbUpdatedBy.username : ""
                    }
                })
            )
            return resSuccess({
                data: finalList
            });
        } else {
            return resError({
                ack_msg: "Invalid Request",
                developer_msg: `parameter not found`,
            });
        }

    } catch (error) {
        console.log("getStatusLog error", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};
/*  aa api akha system badhe jj use thay che jya jya status change thay and view thay che tya. */
export const getStatus = async (req) => {
    try {
        const { status_type, a_application_login_id, status_id, action_flag, current_status, visiblity } = req.body
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        let whereClause = {
            isDelete: '0'
        }

        if (isValid(status_type)) {
            whereClause.order_type = status_type;
        }
        if (isValid(visiblity)) {
            whereClause.visibility = visiblity;
        }

        if (isValid(status_id)) {
            whereClause.id = status_id;
        }
        const stagestatusModelInstance = stagestatusModel(req.tenantDB);

        let displayOrder = 1;
        if (action_flag == 'update') {
            const displayOrderWhere = { isDelete: '0' }
            let getLastStatusDb;
            if (isValid(current_status)) {
                displayOrderWhere.id = current_status;

                getLastStatusDb = await stagestatusModelInstance.findOne({
                    where: displayOrderWhere,
                    attributes: ["display_order_type"],
                    order: [["display_order_type", "ASC"]],
                    raw: true
                })
            }

            displayOrder = isValid(getLastStatusDb) ? (parseInt(getLastStatusDb?.display_order_type) + 1) : 1;

            whereClause = {
                ...whereClause,
                [Op.and]: [
                    {
                        [Op.or]: [
                            { display_order_type: 0 },
                            { display_order_type: displayOrder }
                        ]
                    }
                ]
            };

        }
        const getStatusDataDb = await stagestatusModelInstance.findAll(
            {
                where: whereClause,
                order: [["display_order_type", "ASC"]],
                raw: true,
                attributes: ["id", "name", "color", "order_type", "change_status_team_ids", "show_status_data_team_ids", "display_order_type", "status_type", "visibility"]
            }
        )

        if (!isValid(getStatusDataDb)) {
            return resError({
                ack_msg: "No data found",
                developer_msg: `parameter not found`,
            });
        }
        const changeIdsSet = new Set();
        const showIdsSet = new Set();

        getStatusDataDb.forEach(status => {
            if (isValid(status.change_status_team_ids)) {
                status.change_status_team_ids
                    .split(",")
                    .map(id => id.trim())
                    .filter(Boolean)
                    .forEach(id => changeIdsSet.add(id));
            }

            if (isValid(status.show_status_data_team_ids)) {
                status.show_status_data_team_ids
                    .split(",")
                    .map(id => id.trim())
                    .filter(Boolean)
                    .forEach(id => showIdsSet.add(id));
            }
        });

        const allUserIds = [...new Set([...changeIdsSet, ...showIdsSet])];
        let userMap = {};

        if (allUserIds.length > 0) {
            const users = await loginModel.findAll({
                where: {
                    id: { [Op.in]: allUserIds },
                    isDelete: "0"
                },
                attributes: ["id", "username"],
                raw: true
            });
            users.forEach(u => {
                userMap[u.id] = u.username;
            });
        }
        const statusListArr = (
            await Promise.all(
                getStatusDataDb.map(async (v) => {

                    // Permission checks (your existing logic)
                    if (action_flag === 'view' && findCompanyId.company_flag !== 1) {
                        if (isValid(v.show_status_data_team_ids)) {
                            const isAllowed = v.show_status_data_team_ids
                                .split(",")
                                .map(i => i.trim())
                                .includes(String(a_application_login_id));

                            if (!isAllowed) return null;
                        }
                    }

                    if (action_flag === 'update' && findCompanyId.company_flag !== 1) {
                        if (isValid(v.change_status_team_ids)) {
                            const isAllowed = v.change_status_team_ids
                                .split(",")
                                .map(i => i.trim())
                                .includes(String(a_application_login_id));

                            if (!isAllowed) return null;
                        }
                    }

                    return {
                        ...v,
                        change_status_usernames: isValid(v.change_status_team_ids)
                            ? v.change_status_team_ids
                                .split(",")
                                .map(id => userMap[id.trim()])
                                .filter(Boolean)
                            : [],

                        show_status_data_usernames: isValid(v.show_status_data_team_ids)
                            ? v.show_status_data_team_ids
                                .split(",")
                                .map(id => userMap[id.trim()])
                                .filter(Boolean)
                            : []
                    };
                })
            )
        ).filter(Boolean);


        return resSuccess({
            data: statusListArr
        });

    } catch (error) {
        console.log("getStatus error", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const getCustomerSupportTicketStatusLog = async (req, res) => {
    try {
        const { reference_id } = req.body;

        if (!isValid(reference_id)) {
            return resError({
                ack_msg: "Invalid Request",
                developer_msg: "reference_id not found",
            });
        }

        const { a_application_login_id } = req.body;

        // ✅ Get Tenant DB
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const tenantDBFind = await tenantMasterModel.findOne({
            where: {
                isDelete: 0,
                db_name: WEBSITE_LEAD_HANDLE_DB_NAME,
            },
            attributes: ["a_application_login_id", "company_masters_id"],
        });

        if (!tenantDBFind) {
            return resError({ ack_msg: "Tenant Not Found" });
        }

        const tenantDB = (
            await getTenantDB(
                tenantDBFind.a_application_login_id,
                tenantDBFind.company_masters_id
            )
        ).sequelize;

        // ✅ Models from tenantDB ONLY
        const statusAndStagesLogsModelIntance =
            statusAndStagesLogsModel(tenantDB);
        const stagestatusModelInstance = stagestatusModel(tenantDB);

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

        // ✅ Get Stage/Status (ONLY order_type = 8 for task_managements)



        // ✅ Final Response
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
        console.log("getStatusLog error", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};