import { Op } from "sequelize";
import sequelize from "../../../config/sequelize.js";
import { cartModel } from "../../../models/activities/cartsModel.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import loginModel from "../../../models/application_login/loginModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { targetVsIncentiveModel } from "../../../models/hr/targetVsIncentiveModel.js";
import {
    resBadRequest,
    resSuccess
} from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

const TARGET_TYPE_MAP = {
    1: "Lead",
    2: "Quotation",
    3: "Order",
    4: "Invoice",
};

const INCENTIVE_TYPE_MAP = {
    1: "Percentage",
    2: "Flat",
    3: "None",
};

export const getTargetIncentiveReport = async (req) => {
    try {
        const selectedDates = req.body.selectedDates || [];
        const selectedTeamMembers = req.body.selectedTeamMembers || [];
        const { globalSearch = "", ul = 0, ll = 50, a_application_login_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const companyId = findCompanyId.company_masters_id;

        // Fetch company currency symbol
        const companyCurrency = await companyModel.findOne({
            where: {
                id: companyId,
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

        const currencySymbol = currency?.symbol || "₹";

        // Date range filter for achieved actions
        let dateFilter = {};
        if (selectedDates && selectedDates.length === 2) {
            const startDate = new Date(selectedDates[0]);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(selectedDates[1]);
            endDate.setHours(23, 59, 59, 999);

            dateFilter = {
                created_date_time: {
                    [Op.between]: [startDate, endDate],
                },
            };
        }

        const targetModel = targetVsIncentiveModel(req.tenantDB);
        const CartsModel = cartModel(req.tenantDB);
        const ContactModel = contactModel(req.tenantDB);

        // Fetch target records ONLY for members with targets configured
        let targetWhereClause = {
            company_masters_id: companyId,
            isDelete: "0",
        };

        if (selectedTeamMembers && selectedTeamMembers.length > 0) {
            targetWhereClause.assigned_team_member = {
                [Op.in]: selectedTeamMembers,
            };
        }

        const targetRecords = await targetModel.findAll({
            where: targetWhereClause,
            order: [["id", "DESC"]],
            raw: true,
        });

        if (!targetRecords || targetRecords.length === 0) {
            return resSuccess({
                data: {
                    item: [],
                    totalRecords: 0,
                    summary: {
                        totalMembers: 0,
                        totalTargetAmount: 0,
                        totalAchievedAmount: 0,
                        totalIncentivePayout: 0,
                        currency_symbol: currencySymbol,
                    },
                },
            });
        }

        // Get assigned user IDs from target records
        const assignedUserIds = [
            ...new Set(targetRecords.map((t) => t.assigned_team_member).filter(Boolean)),
        ];

        // Fetch login details for assigned users
        const users = await loginModel.findAll({
            where: {
                id: { [Op.in]: assignedUserIds },
                isDelete: 0,
            },
            attributes: ["id", "username"],
            raw: true,
        });

        const userMap = new Map(users.map((u) => [u.id, u.username]));

        // 1. Batch aggregate contact counts grouped by assigned user
        const contactCounts = await ContactModel.findAll({
            attributes: [
                "a_application_login_id",
                [sequelize.fn("COUNT", sequelize.col("id")), "count"],
            ],
            where: {
                isDelete: 0,
                a_application_login_id: { [Op.in]: assignedUserIds },
                ...dateFilter,
            },
            group: ["a_application_login_id"],
            raw: true,
        });
        const contactCountMap = new Map(
            contactCounts.map((c) => [c.a_application_login_id, parseInt(c.count || 0, 10)])
        );

        // 2. Batch aggregate cart counts & totals grouped by assigned user and cart type
        const cartAggregates = await CartsModel.findAll({
            attributes: [
                "a_application_login_id",
                "type",
                [sequelize.fn("COUNT", sequelize.col("id")), "count"],
                [sequelize.fn("SUM", sequelize.col("grand_total")), "total"],
            ],
            where: {
                isDelete: 0,
                a_application_login_id: { [Op.in]: assignedUserIds },
                type: { [Op.in]: [1, 2, 3] },
                ...dateFilter,
            },
            group: ["a_application_login_id", "type"],
            raw: true,
        });

        const cartMap = new Map();
        cartAggregates.forEach((row) => {
            const key = `${row.a_application_login_id}_${row.type}`;
            cartMap.set(key, {
                count: parseInt(row.count || 0, 10),
                total: parseFloat(row.total || 0),
            });
        });

        // 3. Fast synchronous mapping in memory
        const reportItems = targetRecords
            .map((targetRecord) => {
                const userId = targetRecord.assigned_team_member;
                const userName = userMap.get(userId);
                if (!userName) return null; // Skip if user is deleted

                const targetType = parseInt(targetRecord.target_type || 4, 10);
                const targetCount = parseInt(targetRecord.target_count || 0, 10);
                const targetValue = parseFloat(targetRecord.target_value || 0);
                const incentiveType = parseInt(targetRecord.incentive_type || 1, 10);
                const incentiveVal = parseFloat(targetRecord.incentive_value || 0);
                const fromDate = targetRecord.target_fromdate || "";
                const toDate = targetRecord.target_todate || "";

                let achievedCount = 0;
                let achievedValue = 0;

                if (targetType === 1) {
                    // Lead / Contact
                    achievedCount = contactCountMap.get(userId) || 0;
                    achievedValue = 0;
                } else {
                    // Quotation (targetType 2) -> cart type 1, Order (targetType 3) -> cart type 2, Invoice (targetType 4) -> cart type 3
                    const cartType = targetType === 2 ? 1 : targetType === 3 ? 2 : 3;
                    const stats = cartMap.get(`${userId}_${cartType}`) || { count: 0, total: 0 };
                    achievedCount = stats.count;
                    achievedValue = stats.total;
                }

                // Calculate achievement percentages in backend
                let countPct = targetCount > 0 ? Number(((achievedCount / targetCount) * 100).toFixed(2)) : 0;
                let valuePct = targetValue > 0 ? Number(((achievedValue / targetValue) * 100).toFixed(2)) : 0;

                let primaryAchPct = targetValue > 0 ? valuePct : countPct;

                // Calculate earned incentive in backend
                let earnedIncentive = 0;
                if (incentiveType === 1) {
                    // Percentage wise
                    earnedIncentive = Math.round((achievedValue * incentiveVal) / 100);
                } else if (incentiveType === 2) {
                    // Flat wise (fixed amount payout)
                    if (
                        (targetCount > 0 && achievedCount >= targetCount) ||
                        (targetValue > 0 && achievedValue >= targetValue)
                    ) {
                        earnedIncentive = incentiveVal;
                    } else if (targetCount === 0 && targetValue === 0) {
                        earnedIncentive = incentiveVal;
                    }
                } else {
                    // None
                    earnedIncentive = 0;
                }

                let statusStr = "In Progress";
                if (primaryAchPct >= 100) statusStr = "Target Achieved";
                else if (primaryAchPct >= 80) statusStr = "Near Target";
                else statusStr = "Behind Target";

                return {
                    id: targetRecord.id,
                    user_id: userId,
                    username: userName,
                    target_type: targetType,
                    target_type_label: TARGET_TYPE_MAP[targetType] || "Invoice",
                    target_fromdate: fromDate,
                    target_todate: toDate,
                    target_count: targetCount,
                    achieved_count: achievedCount,
                    target_value: targetValue,
                    achieved_value: achievedValue,
                    target_amount: targetValue,
                    achieved_amount: achievedValue,
                    achievement_pct: primaryAchPct,
                    achievement_percentage: primaryAchPct,
                    incentive_type: incentiveType,
                    incentive_type_label: INCENTIVE_TYPE_MAP[incentiveType] || "None",
                    incentive_val: incentiveVal,
                    incentive_value: incentiveVal,
                    earned_incentive: earnedIncentive,
                    incentive_amount: earnedIncentive,
                    status: statusStr,
                    currency_symbol: currencySymbol,
                };
            })
            .filter(Boolean);

        // Calculate Summary Totals in backend
        const totalMembers = new Set(reportItems.map((item) => item.user_id)).size;
        const totalTargetAmount = reportItems.reduce((acc, item) => acc + item.target_value, 0);
        const totalAchievedAmount = reportItems.reduce((acc, item) => acc + item.achieved_value, 0);
        const totalIncentivePayout = reportItems.reduce((acc, item) => acc + item.earned_incentive, 0);

        // Global Search Filter
        let filteredItems = reportItems;
        if (globalSearch && globalSearch.trim()) {
            const searchTerm = globalSearch.trim().toLowerCase();
            filteredItems = reportItems.filter(
                (item) =>
                    item.username.toLowerCase().includes(searchTerm) ||
                    item.target_type_label.toLowerCase().includes(searchTerm) ||
                    item.status.toLowerCase().includes(searchTerm) ||
                    item.incentive_type_label.toLowerCase().includes(searchTerm)
            );
        }

        const paginatedItems = filteredItems.slice(ul, ul + ll);

        return resSuccess({
            data: {
                item: paginatedItems,
                totalRecords: filteredItems.length,
                summary: {
                    totalMembers,
                    totalTargetAmount,
                    totalAchievedAmount,
                    totalIncentivePayout,
                    currency_symbol: currencySymbol,
                },
            },
        });
    } catch (e) {
        console.error("getTargetIncentiveReport Service Error:", e);
        return resBadRequest({ developer_msg: `Error: ${e.message || e}` });
    }
};
