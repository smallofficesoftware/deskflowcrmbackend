import { Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { taskManagementModel } from "../../../models/activities/taskManagementModel.js";
import { stagestatusModel } from "../../../models/masters/stagestatusModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

export const statusWiseReport = async (req) => {
    try {
        const {
            a_application_login_id,
            selected_dates,
            selectedStageStatus = [],
            selectedTeamMembers = [],
            ul = 0,
            ll = 50
        } = req.body;

        const globalSearch = req.body.globalSearch?.trim() || "";

        if (!Array.isArray(selected_dates) || selected_dates.length !== 2) {
            return resError({
                ack_msg: "Invalid Input",
                developer_msg: "selected_dates must be an array of two valid YYYY-MM-DD dates",
            });
        }

        const parsedDates = selected_dates.map(date => {
            const parsed = new Date(date);
            if (isNaN(parsed.getTime())) return null;
            return parsed.toISOString().split('T')[0];
        });

        if (parsedDates.some(date => date === null)) {
            return resError({
                ack_msg: "Invalid Input",
                developer_msg: "selected_dates must contain valid dates",
            });
        }

        const [startDate, endDate] = parsedDates;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        if (!findCompanyId?.company_masters_id) {
            return resError({
                ack_msg: "Invalid Company",
                developer_msg: "No company found for the provided login ID",
            });
        }

        const companyId = findCompanyId.company_masters_id;

        // === User Rights ===
        const { showAllData, showPersonalData } = await getUserRights({
            company_masters_id: companyId,
            a_application_login_id,
            page_id: PAGE_ID.STATUS_REPORT,
            tenentId: req.tenantDB
        });

        let taskWhere = { company_masters_id: companyId };

        if (showAllData) {
            // no filter
        } else if (showPersonalData) {
            taskWhere[Op.or] = [
                { a_application_login_id },
                Sequelize.literal(`FIND_IN_SET('${a_application_login_id}', assigned_team_member) > 0`),
            ];
        } else {
            return resSuccess({ data: { item: [] }, ack_msg: "No data available" });
        }

        // === Team Member Filter ===
        if (selectedTeamMembers?.length > 0) {
            const teamIds = selectedTeamMembers.map(id => String(id).trim()).filter(Boolean);
            if (teamIds.length > 0) {
                const assignedConditions = teamIds.map(id =>
                    Sequelize.literal(`FIND_IN_SET('${id}', assigned_team_member) > 0`)
                );
                taskWhere[Op.and] = [
                    ...(taskWhere[Op.and] || []),
                    {
                        [Op.or]: [
                            { a_application_login_id: { [Op.in]: teamIds } },
                            { [Op.or]: assignedConditions }
                        ]
                    }
                ];
            }
        }

        const StagestatusModel = stagestatusModel(req.tenantDB);
        const TaskManagementModel = taskManagementModel(req.tenantDB);

        // === Helper: build status where ===
        const buildStatusWhere = (visibility) => {
            const where = {
                isDelete: 0,
                order_type: 8,
                visibility,
            };

            if (Array.isArray(selectedStageStatus) && selectedStageStatus.length > 0) {
                const validIds = selectedStageStatus.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
                if (validIds.length > 0) where.id = { [Op.in]: validIds };
            }

            if (globalSearch) {
                const stringColumns = Object.keys(StagestatusModel.rawAttributes).filter(col => {
                    const attr = StagestatusModel.rawAttributes[col];
                    return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
                });
                where[Op.or] = stringColumns.map(col => ({
                    [col]: { [Op.like]: `%${globalSearch}%` }
                }));
            }

            return where;
        };

        // === Helper: fetch task counts grouped by status ===
        const getTaskCounts = async (isSupportTicket) => {
            return await TaskManagementModel.findAll({
                where: {
                    ...taskWhere,
                    isDelete: 0,
                    is_support_ticket: isSupportTicket,
                    created_date_time: {
                        [Op.between]: [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
                    },
                    status: { [Op.ne]: null }
                },
                attributes: [
                    'status',
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
                ],
                group: ['status'],
                raw: true
            });
        };

        // === Helper: comma-separated status → id:count map ===
        const CountMap = (rows, validIds) => {
            const map = {};
            rows.forEach(row => {
                String(row.status ?? '')
                    .split(',')
                    .map(id => parseInt(id.trim(), 10))
                    .filter(id => !isNaN(id))
                    .forEach(id => {
                        if (validIds.includes(id)) {
                            map[id] = (map[id] || 0) + parseInt(row.count);
                        }
                    });
            });
            return map;
        };

        // === Helper: map status rows + count map → result array ===
        const result = (statusRows, countMap) =>
            statusRows.map(s => ({
                id: s.id,
                name: s.name || "-",
                count: countMap[s.id] || 0,
            }));

        const [internalStatuses, externalStatuses] = await Promise.all([
            StagestatusModel.findAll({
                where: buildStatusWhere(0),
                attributes: ["id", "name"],
                order: [["name", "ASC"]],
                offset: ul,
                limit: ll,
            }),
            StagestatusModel.findAll({
                where: buildStatusWhere(1),
                attributes: ["id", "name"],
                order: [["name", "ASC"]],
                offset: ul,
                limit: ll,
            }),
        ]);


        const internalIds = internalStatuses.map(s => s.id);
        const externalIds = externalStatuses.map(s => s.id);

        const [supportRows, normalRows] = await Promise.all([
            getTaskCounts(1),
            getTaskCounts(0),
        ]);

        const internalSupportMap = CountMap(supportRows, internalIds);
        const internalNormalMap = CountMap(normalRows, internalIds);
        const externalSupportMap = CountMap(supportRows, externalIds);
        const externalNormalMap = CountMap(normalRows, externalIds);

        return resSuccess({
            data: {
                item: {
                    internal: {
                        support_ticket: result(internalStatuses, internalSupportMap),
                        normal_task: result(internalStatuses, internalNormalMap),
                    },
                    external: {
                        support_ticket: result(externalStatuses, externalSupportMap),
                        normal_task: result(externalStatuses, externalNormalMap),
                    }
                }
            },
            ack_msg: "Status-wise report retrieved successfully",
        });

    } catch (e) {
        console.error("Error in statusWiseReport:", e);
        return resError({
            ack_msg: "Error retrieving Status report",
            developer_msg: e.message,
        });
    }
};