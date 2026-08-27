import moment from "moment";
import Sequelize, { col, fn, literal, Op } from "sequelize";
import sequelize from "../../config/sequelize.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { callhistoryModel } from "../../models/activities/callhistoryModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { reminderMessagesModel } from "../../models/activities/reminderMessagesModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import { trackingModel } from "../../models/activities/trackingModel.js";
import { visitsModel } from "../../models/activities/visitModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import currencyModel from "../../models/configuration/currencyModel.js";
import { attendanceModel } from "../../models/hr/attendanceModel.js";
import { employeePayrollModel } from "../../models/hr/employeePayrollModel.js";
import { expensesModel } from "../../models/hr/expensesModel.js";
import { leavesModel } from "../../models/hr/leavesModel.js";
import { leaveTypeModel } from "../../models/hr/leaveTypeModel.js";
import { productBillOfMaterialModel } from "../../models/product_settings/productBillOfMaterialModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { JobCardsModel } from "../../models/production/JobCardsModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import {
    resBadRequest,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Sanitize an id to a positive integer string for safe SQL literal use
 * (we only ever use these inside FIND_IN_SET literals).
 */
const safeInt = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? String(n) : null;
};

/**
 * Build an AND-conditions array that enforces:
 *   - "all"      -> company-scoped, optionally narrowed by team filter
 *   - "personal" -> own + assigned-to-me, team filter intersected with self
 *   - none       -> hard "never match"
 *
 * Returns an array suitable for `[Op.and]: [...]`.
 */
const buildAccessAnd = ({
    rights,                  // { showAllData, showPersonalData }
    myUserId,                // logged-in a_application_login_id
    companyId,               // company_masters_id
    teamFilterIds = [],      // request body `data` (already cleaned)
    ownerCol = "a_application_login_id",
    assigneeCols = [],       // extra columns that count as "assigned to user"
    assigneeIsCsv = false,   // true when assigneeCol stores comma-separated ids
}) => {
    const andList = [];
    const teamIds = (teamFilterIds || []).map(safeInt).filter(Boolean);

    const ownerOrAssigned = (ids) => {
        const orParts = [];
        orParts.push({ [ownerCol]: { [Op.in]: ids } });
        for (const col of assigneeCols) {
            if (assigneeIsCsv) {
                orParts.push(
                    Sequelize.literal(
                        `(${ids.map((id) => `FIND_IN_SET(${id}, ${col}) > 0`).join(" OR ")})`
                    )
                );
            } else {
                orParts.push({ [col]: { [Op.in]: ids } });
            }
        }
        return { [Op.or]: orParts };
    };

    if (rights?.showAllData) {
        andList.push({ company_masters_id: companyId });
        if (teamIds.length) andList.push(ownerOrAssigned(teamIds));
    } else if (rights?.showPersonalData) {
        const me = safeInt(myUserId);
        // Personal users can only ever see their own scope.
        // If a team filter is sent, it is INTERSECTED with self.
        const allowedIds = teamIds.length
            ? teamIds.filter((id) => id === me)
            : me
                ? [me]
                : [];
        if (!allowedIds.length) {
            andList.push(Sequelize.literal("1 = 0"));
        } else {
            andList.push({ company_masters_id: companyId });
            andList.push(ownerOrAssigned(allowedIds));
        }
    } else {
        // No rights → never match
        andList.push(Sequelize.literal("1 = 0"));
    }

    return andList;
};

const dateAnd = (col, start, end) =>
    Sequelize.where(Sequelize.fn("DATE", Sequelize.col(col)), {
        [Op.between]: [start, end],
    });


const generateDateRange = (start, end) => {
    const dates = [];
    let current = moment(start);

    while (current.isSameOrBefore(end, "day")) {
        dates.push(current.format("YYYY-MM-DD"));
        current.add(1, "day");
    }

    return dates;
};

const convertHHMMToDecimal = (time) => {
    const [h, m] = time.split(":").map(Number);
    return h + (m / 60);
};
/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

export const getCrmInsight = async (req) => {
    try {
        let { a_application_login_id, selectedDates, isShowAll, data } = req.body;

        // Validate input
        if (
            !Array.isArray(selectedDates) ||
            selectedDates.length < 2 ||
            !selectedDates[0] ||
            !selectedDates[1]
        ) {
            return resBadRequest({
                developer_msg: "selectedDates [start, end] is required",
            });
        }
        const start = moment(selectedDates[0]).format("YYYY-MM-DD");
        const end = moment(selectedDates[1]).format("YYYY-MM-DD");
        if (start === "Invalid date" || end === "Invalid date") {
            return resBadRequest({ developer_msg: "Invalid selectedDates" });
        }

        data = Array.isArray(data) ? data.filter(Boolean) : [];

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const companyId = findCompanyId.company_masters_id;
        const tenantDB = req.tenantDB;

        const INqModel = inquiryModel(tenantDB);
        const reminderMsgModel = reminderMessagesModel(tenantDB);
        const CATModel = cartModel(tenantDB);
        const COTModel = contactModel(tenantDB);
        const VisitModel = visitsModel(tenantDB);
        const cartItem = cartItemModel(tenantDB);
        const CallhistoryModel = callhistoryModel(tenantDB);
        const TaskModel = taskManagementModel(tenantDB);
        const ProductModel = productModel(tenantDB);

        /* shorthand: fetch rights and build the AND list for one page */
        const buildFor = async ({ pageId, ownerCol, assigneeCols = [], csv = false }) => {
            const rights = await getUserRights({
                company_masters_id: companyId,
                a_application_login_id,
                page_id: pageId,
                tenentId: tenantDB,
            });
            return buildAccessAnd({
                rights,
                myUserId: a_application_login_id,
                companyId,
                teamFilterIds: data,
                ownerCol,
                assigneeCols,
                assigneeIsCsv: csv,
            });
        };

        /* ----------- Contact ----------- */
        const contactAnd = await buildFor({
            pageId: PAGE_ID.CONTACT,
            ownerCol: "a_application_login_id",
            assigneeCols: ["assinged_to_work_a_application_id"],
            csv: true, // CSV column → FIND_IN_SET
        });
        const whereClauseContact = {
            isDelete: "0",
            [Op.and]: [...contactAnd, dateAnd("created_date_time", start, end)],
        };
        const totalContactCount = await COTModel.count({ where: whereClauseContact });

        /* ----------- Inquiry ----------- */
        const inquiryAnd = await buildFor({
            pageId: PAGE_ID.INQUIRY,
            ownerCol: "a_application_login_id",
        });
        const whereClauseInquiry = {
            isDelete: "0",
            [Op.and]: [...inquiryAnd, dateAnd("created_date_time", start, end)],
        };
        const totalInquiryCount = await INqModel.count({ where: whereClauseInquiry });

        /* ----------- Reminder ----------- */
        const reminderAnd = await buildFor({
            pageId: PAGE_ID.REMINDER,
            ownerCol: "a_application_login_id",
            assigneeCols: ["assigned_to"],
        });
        const whereClauseRemainder = {
            isDelete: "0",
            status: 0,
            [Op.and]: [...reminderAnd, dateAnd("reminder_data_time", start, end)],
        };
        const totalReminderCount = await reminderMsgModel.count({
            where: whereClauseRemainder,
        });

        /* ----------- Visit ----------- */
        const visitAnd = await buildFor({
            pageId: PAGE_ID.VISIT,
            ownerCol: "a_application_login_id",
        });
        const whereClauseVisit = {
            isDelete: 0,
            [Op.and]: [...visitAnd, dateAnd("start_date", start, end)],
        };
        const todayVisitCount = await VisitModel.count({ where: whereClauseVisit });

        /* ----------- Call ----------- */
        const callAnd = await buildFor({
            pageId: PAGE_ID.CALL_HISTORY,
            ownerCol: "a_application_login_id",
        });
        const whereClauseCall = {
            isDelete: "0",
            [Op.and]: [...callAnd, dateAnd("call_date_time", start, end)],
        };
        const todayCallCount = await CallhistoryModel.count({ where: whereClauseCall });

        /* ----------- Support Ticket ----------- */
        const supportAnd = await buildFor({
            pageId: PAGE_ID.SUPPORT_TICKET,
            ownerCol: "a_application_login_id",
            assigneeCols: ["assigned_team_member"]
        });
        const whereClauseSupportTicket = {
            isDelete: "0",
            is_support_ticket: "1",
            task_template: "0",
            is_not_visible: "0",
            [Op.and]: [...supportAnd, dateAnd("created_date_time", start, end)],
        };
        const TotalsupportTicketCount = await TaskModel.count({
            where: whereClauseSupportTicket,
        });

        /* ----------- Task ----------- */
        const taskAnd = await buildFor({
            pageId: PAGE_ID.TASK_MANAGEMENT,
            ownerCol: "a_application_login_id",
            assigneeCols: ["assigned_team_member"]
        });
        const whereClauseTask = {
            isDelete: "0",
            is_support_ticket: "0",
            task_template: "0",
            is_not_visible: "0",
            [Op.and]: [...taskAnd, dateAnd("created_date_time", start, end)],
        };
        const TotalTaskCount = await TaskModel.count({ where: whereClauseTask });

        /* ----------- Currency ----------- */
        const companyCurrency = await companyModel.findOne({
            where: { id: companyId, isDelete: 0 },
            attributes: ["currency_id"],
        });
        const currency = await currencyModel.findOne({
            where: { id: companyCurrency?.currency_id, isDelete: 0 },
            attributes: ["symbol"],
        });

        /* ----------- Source-type vs Inquiry (uses contact rights) ----------- */
        const sourceTypeVsInquiry = await COTModel.findAll({
            attributes: [
                "source_type_id",
                [Sequelize.fn("COUNT", Sequelize.col("*")), "counts"],
            ],
            where: whereClauseContact,
            group: ["source_type_id"],
            having: Sequelize.literal("COUNT(*) > 0"),
            order: [["counts", "DESC"]],
        });

        /* ----------- Bar chart (Quotation / Order / Invoice) ----------- */
        // Use the strictest of the three pages so the bar chart never leaks
        // data the user cannot see in the per-type cards.
        const [qRights, oRights, iRights] = await Promise.all([
            getUserRights({
                company_masters_id: companyId,
                a_application_login_id,
                page_id: PAGE_ID.QUOTATION,
                tenentId: tenantDB,
            }),
            getUserRights({
                company_masters_id: companyId,
                a_application_login_id,
                page_id: PAGE_ID.ORDER,
                tenentId: tenantDB,
            }),
            getUserRights({
                company_masters_id: companyId,
                a_application_login_id,
                page_id: PAGE_ID.INVOICE,
                tenentId: tenantDB,
            }),
        ]);
        const chartRights = {
            showAllData: qRights.showAllData && oRights.showAllData && iRights.showAllData,
            showPersonalData:
                qRights.showPersonalData ||
                oRights.showPersonalData ||
                iRights.showPersonalData,
        };
        const chartAnd = buildAccessAnd({
            rights: chartRights,
            myUserId: a_application_login_id,
            companyId,
            teamFilterIds: data,
            ownerCol: "a_application_login_id",
        });
        const cartWhere = {
            isDelete: "0",
            type: { [Op.in]: [1, 2, 3] },
            [Op.and]: [...chartAnd, dateAnd("update_Date_time", start, end)],
        };
        const rows = await CATModel.findAll({
            where: cartWhere,
            attributes: [
                "type",
                [Sequelize.fn("MONTH", Sequelize.col("cart_date")), "month"],
                [Sequelize.fn("COUNT", Sequelize.col("*")), "count"],
            ],
            group: ["type", Sequelize.fn("MONTH", Sequelize.col("cart_date"))],
            order: [
                ["type", "ASC"],
                [Sequelize.literal("month"), "ASC"],
            ],
            raw: true,
        });
        const allMonths = Array.from(new Set(rows.map((r) => r.month))).sort(
            (a, b) => a - b
        );
        const series = { 1: [], 2: [], 3: [] };
        for (const type of [1, 2, 3]) {
            for (const m of allMonths) {
                const rec = rows.find((r) => r.type === type && r.month === m);
                series[type].push(rec ? rec.count : 0);
            }
        }
        const barchartData = {
            months: allMonths,
            quotation: series[1],
            salesOrder: series[2],
            invoice: series[3],
        };

        /* ----------- Per-type counts + sums (each respects its own page rights) ----------- */
        const pageidSalesObj = {
            1: PAGE_ID.QUOTATION,
            2: PAGE_ID.ORDER,
            3: PAGE_ID.INVOICE,
            4: PAGE_ID.PURCHASE,
            5: PAGE_ID.PURCHASE_ORDER,
            6: PAGE_ID.RETURN_SALES_INVOICE,
            7: PAGE_ID.RETURN_PURCHASE_INVOICE,
            8: PAGE_ID.INWARD,
            9: PAGE_ID.DISPATCH,
        };

        const countByType = async (type) => {
            const rights = await getUserRights({
                company_masters_id: companyId,
                a_application_login_id,
                page_id: pageidSalesObj[type],
                tenentId: tenantDB,
            });
            const salesAnd = await buildFor({
                pageId: pageidSalesObj[type],
                ownerCol: "a_application_login_id",
            });
            const whereClauseSales = {
                isDelete: "0",
                [Op.and]: [...salesAnd, dateAnd("update_Date_time", start, end)],
            };
            const [count, sum] = await Promise.all([
                CATModel.count({ where: { ...whereClauseSales, type } }),
                CATModel.sum("grand_total", {
                    where: {
                        ...whereClauseSales,
                        type,
                        cart_number: { [Op.ne]: null, [Op.not]: "" },
                    },
                }),
            ]);
            return { count, sum: `${currency?.symbol || ""} ${sum || 0}` };
        };

        const [
            quotation,
            order,
            invoice,
            purchase,
            purchaseOrder,
            returnSalesInvoice,
            returnPurchaseInvoice,
            inward,
            dispath,
        ] = await Promise.all([
            countByType(1),
            countByType(2),
            countByType(3),
            countByType(4),
            countByType(5),
            countByType(6),
            countByType(7),
            countByType(8),
            countByType(9),
        ]);

        /* ----------- Out-of-stock (use Purchase rights as the gate for stock view) ----------- */
        const stockAnd = await buildFor({
            pageId: PAGE_ID.PURCHASE,
            ownerCol: "a_application_login_id",
        });
        const stockScopedAnd = (extraAnd = []) => [...stockAnd, ...extraAnd];

        const products = await ProductModel.findAll({
            where: { isDelete: 0, company_masters_id: companyId },
            attributes: ["id", "product_name", "min_stock_quantity"],
            raw: true,
        });
        const productIds = products.map((p) => p.id);

        const dateRangeFilter = { [Op.between]: [start, end] };

        const [openingStocks, purchaseSums, salesSums] = await Promise.all([
            cartItem.findAll({
                where: {
                    isDelete: 0,
                    cart_type: { [Op.in]: [3, 4] },
                    cart_date: { [Op.lte]: start },
                    cart_number: { [Op.ne]: null, [Op.not]: "" },
                    item_product_id: { [Op.in]: productIds },
                    [Op.and]: stockScopedAnd(),
                },
                attributes: ["item_product_id", "cart_type", "item_qty"],
                raw: true,
            }),
            cartItem.findAll({
                where: {
                    isDelete: 0,
                    cart_type: 4,
                    cart_date: dateRangeFilter,
                    item_product_id: { [Op.in]: productIds },
                    [Op.and]: stockScopedAnd(),
                },
                attributes: [
                    "item_product_id",
                    [sequelize.fn("SUM", sequelize.col("item_qty")), "purchase"],
                ],
                group: ["item_product_id"],
                raw: true,
            }),
            cartItem.findAll({
                where: {
                    isDelete: 0,
                    cart_type: 3,
                    cart_date: dateRangeFilter,
                    item_product_id: { [Op.in]: productIds },
                    [Op.and]: stockScopedAnd(),
                },
                attributes: [
                    "item_product_id",
                    [sequelize.fn("SUM", sequelize.col("item_qty")), "sales"],
                ],
                group: ["item_product_id"],
                raw: true,
            }),
        ]);

        const purchaseMap = Object.fromEntries(
            purchaseSums.map((p) => [p.item_product_id, parseFloat(p.purchase || 0)])
        );
        const salesMap = Object.fromEntries(
            salesSums.map((s) => [s.item_product_id, parseFloat(s.sales || 0)])
        );

        const openingMap = {};
        for (const item of openingStocks) {
            const id = item.item_product_id;
            const qty = parseFloat(item.item_qty || 0);
            openingMap[id] = openingMap[id] || 0;
            openingMap[id] += item.cart_type === 4 ? qty : -qty;
        }

        let outOfStockCount = 0;
        for (const product of products) {
            const id = product.id;
            const openQty = openingMap[id] || 0;
            const netClosing = openQty + (purchaseMap[id] || 0) - (salesMap[id] || 0);
            if (netClosing <= product.min_stock_quantity) outOfStockCount++;
        }

        /* ----------- Team-wise Insight ----------- */

        const teamMembers = await companyVsApplicationLoginModel.findAll({
            where: {
                isDelete: 0,
                company_masters_id: companyId,
            },
            attributes: ["a_application_login_id"],
            raw: true,
        });

        const teamInsight = await Promise.all(
            teamMembers.map(async (member) => {
                const userId = member.a_application_login_id;

                const user = await loginModel.findOne({
                    where: { id: userId },
                    attributes: ["username"],
                    raw: true,
                });

                const username = user?.username || "Unknown";

                const callCount = await CallhistoryModel.count({
                    where: {
                        isDelete: "0",
                        a_application_login_id: userId,
                        [Op.and]: [...callAnd, dateAnd("call_date_time", start, end)],
                    },
                });

                const visitCount = await VisitModel.count({
                    where: {
                        isDelete: 0,
                        a_application_login_id: userId,
                        [Op.and]: [...visitAnd, dateAnd("start_date", start, end)],
                    },
                });

                const orderData = await CATModel.findOne({
                    attributes: [
                        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
                        [Sequelize.fn("SUM", Sequelize.col("taxable_amt")), "amount"],
                    ],
                    where: {
                        isDelete: "0",
                        type: 2,
                        a_application_login_id: userId,
                        [Op.and]: [...chartAnd, dateAnd("update_Date_time", start, end)],
                    },
                    raw: true,
                });

                const invoiceData = await CATModel.findOne({
                    attributes: [
                        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
                        [Sequelize.fn("SUM", Sequelize.col("taxable_amt")), "amount"],
                    ],
                    where: {
                        isDelete: "0",
                        type: 3,
                        a_application_login_id: userId,
                        [Op.and]: [...chartAnd, dateAnd("update_Date_time", start, end)],
                    },
                    raw: true,
                });

                return {
                    username,
                    callCount,
                    visitCount,
                    order: {
                        count: parseInt(orderData?.count || 0),
                        amount: orderData?.amount || 0,
                    },
                    sell_invoice: {
                        count: parseInt(invoiceData?.count || 0),
                        amount: invoiceData?.amount || 0,
                    },
                };
            })
        );

        return resSuccess({
            data: {
                barchartData,
                totalContactCount,
                totalInquiryCount,
                totalReminderCount,
                totalQuotation: quotation.count,
                totalApprovedQuotation: quotation.sum,
                totalOrder: order.count,
                totalApprovedOrder: order.sum,
                totalInvoice: invoice.count,
                totalApprovedInvoice: invoice.sum,
                sourceTypeVsInquiry,
                purchaseCount: purchase.count,
                purchaseApprovedCount: purchase.sum,
                purchaseOrderCount: purchaseOrder.count,
                purchaseOrderApprovedCount: purchaseOrder.sum,
                totalReturnSalesInvoice: returnSalesInvoice.count,
                returnSalesInvoiceApprovedCount: returnSalesInvoice.sum,
                totalReturnPurchaseInvoice: returnPurchaseInvoice.count,
                returnPurchaseInvoiceApprovedCount: returnPurchaseInvoice.sum,
                TotalInward: inward.count,
                inwardCount: inward.sum,
                TotalDispath: dispath.count,
                dispathCount: dispath.sum,
                workOrderCount: 0,
                workOrderApprovedCount: 0,
                todayVisitCount,
                todayCallCount,
                outOfStockCount,
                TotalsupportTicketCount,
                TotalTaskCount,
                teamInsight
            },
        });
    } catch (e) {
        console.log("getCrmInsight error:", e);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const getHrmsInsight = async (req) => {
    try {
        let { a_application_login_id, selectedDates, year } = req.body;

        const tenantDB = req.tenantDB;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const companyId = findCompanyId.company_masters_id;

        // =============================
        // DATE RANGE (optional)
        // =============================
        let start = null;
        let end = null;

        if (selectedDates && selectedDates.length === 2) {
            start = moment(selectedDates[0]).format("YYYY-MM-DD");
            end = moment(selectedDates[1]).format("YYYY-MM-DD");
        }

        // =============================
        // TEAM MEMBERS
        // =============================
        const teamMembers = await companyVsApplicationLoginModel.count({
            where: {
                isDelete: 0,
                company_masters_id: companyId,
            },
        });

        // =============================
        // REUSABLE SALARY FUNCTION
        // =============================
        const calculateSalary = async ({ start, end }) => {

            const members = await companyVsApplicationLoginModel.findAll({
                where: {
                    isDelete: 0,
                    company_masters_id: companyId,
                },
                attributes: ["a_application_login_id"],
                raw: true,
            });

            let totalPresent = 0;
            let totalAbsent = 0;
            let totalSalary = 0;

            const dateRange = generateDateRange(start, end);

            const LeaveTypeModel = leaveTypeModel(tenantDB);
            const empPayrollModel = employeePayrollModel(req.tenantDB);

            const leaveTypes = await LeaveTypeModel.findAll({
                where: {
                    company_masters_id: companyId,
                    isDelete: 0,
                },
                raw: true,
            });

            const leaveTypeMap = {};
            leaveTypes.forEach(type => {
                leaveTypeMap[type.id] = type.paid_by;
            });

            for (const member of members) {

                const userId = member.a_application_login_id;

                // const user = await loginModel.findOne({
                //     where: { id: userId },
                //     attributes: [
                //         "min_present_hours",
                //         "salary_type",
                //         "salary_amount_type_wise",
                //         "week_off_days"
                //     ],
                //     raw: true,
                // });
                const user = await empPayrollModel.findOne({
                    where: {
                        a_application_login_id: userId,
                        isDelete: 0,
                    },
                    attributes: ["min_present_hours", "salary_type", "salary_amount_type_wise", "week_off_days"],
                    raw: true,
                });
                const minPresentHours = convertHHMMToDecimal(user.min_present_hours || "00:00");

                const weekOffArray = user.week_off_days
                    ? user.week_off_days.split(",").map(Number)
                    : [];

                // Attendance
                const AttendanceModel = attendanceModel(tenantDB);
                const attendance = await AttendanceModel.findAll({
                    where: {
                        a_application_login_id: userId,
                        isDelete: 0,
                        [Op.and]: dateAnd("check_in_out_date_time", start, end),
                    },
                    raw: true,
                });

                // Leaves
                const LeavesModel = leavesModel(tenantDB);
                const leaves = await LeavesModel.findAll({
                    where: {
                        a_application_login_id: userId,
                        leave_status: 2,
                        isDelete: 0,
                        [Op.and]: dateAnd("leave_date", start, end),
                    },
                    raw: true,
                });

                let companyPaidLeave = 0;

                leaves.forEach(l => {
                    const paidBy = leaveTypeMap[l.leave_type_id];
                    if (paidBy === 1) companyPaidLeave++;
                });

                const attendanceMap = {};
                attendance.forEach(a => {
                    const date = moment(a.check_in_out_date_time).format("YYYY-MM-DD");
                    if (!attendanceMap[date]) attendanceMap[date] = [];
                    attendanceMap[date].push(a);
                });

                const leaveMap = {};
                leaves.forEach(l => {
                    const date = moment(l.leave_date).format("YYYY-MM-DD");
                    leaveMap[date] = true;
                });

                let presentDays = 0;
                let workingSeconds = 0;

                dateRange.forEach(date => {

                    const day = moment(date).day();

                    if (leaveMap[date]) return;
                    if (weekOffArray.includes(day)) return;

                    const logs = attendanceMap[date];

                    if (logs && logs.length > 0) {
                        let daySeconds = 0;

                        logs.forEach(l => {
                            const [h, m, s] = (l.total_working_hour || "00:00:00")
                                .split(":").map(Number);
                            daySeconds += h * 3600 + m * 60 + s;
                        });

                        const hours = daySeconds / 3600;

                        if (!minPresentHours || hours >= minPresentHours) {
                            presentDays++;
                            workingSeconds += daySeconds;
                        } else {
                            totalAbsent++;
                        }
                    } else {
                        totalAbsent++;
                    }
                });

                totalPresent += presentDays;

                const salaryType = Number(user.salary_type);
                const salaryAmount = Number(user.salary_amount_type_wise);

                let salary = 0;
                const totalPaidDays = presentDays + companyPaidLeave;

                if (salaryType === 1) {
                    salary = (workingSeconds / 3600) * salaryAmount;
                } else if (salaryType === 2) {
                    salary = totalPaidDays * salaryAmount;
                }

                totalSalary += salary;
            }

            return {
                totalPresent,
                totalAbsent,
                totalSalary
            };
        };

        // =============================
        // SUMMARY (DATE RANGE)
        // =============================
        let employeeData = null;
        let totalVisitCount = 0;
        let onLeave = 0;
        let totalExpense = 0;

        if (start && end) {

            const result = await calculateSalary({ start, end });

            employeeData = {
                presentEmployee: result.totalPresent,
                absentEmployee: result.totalAbsent,
                salary: Number(result.totalSalary.toFixed(2))
            };

            // Visit Count
            const VisitModel = visitsModel(tenantDB);
            totalVisitCount = await VisitModel.count({
                where: {
                    isDelete: 0,
                    a_application_login_id: findCompanyId.a_application_login_id,
                    [Op.and]: dateAnd("created_date_time", start, end),
                },
            });

            // Leaves
            const LeavesModel = leavesModel(tenantDB);
            onLeave = await LeavesModel.count({
                where: {
                    isDelete: 0,
                    leave_status: 2,
                    [Op.and]: dateAnd("leave_date", start, end),
                },
            });

            // Expenses
            const ExpensesModel = expensesModel(tenantDB);
            const expense = await ExpensesModel.findOne({
                attributes: [[fn("SUM", col("pass_amount")), "totalExpense"]],
                where: {
                    isDelete: 0,
                    expense_status: 2,
                    [Op.and]: dateAnd("created_date_time", start, end),
                },
                raw: true,
            });

            totalExpense = Number(expense?.totalExpense || 0);
        }

        // =============================
        // MONTHLY (YEAR)
        // =============================
        let monthlyBarchart = null;

        if (year) {
            monthlyBarchart = await Promise.all(
                Array.from({ length: 12 }, async (_, month) => {

                    const mStart = moment()
                        .year(year)
                        .month(month)
                        .startOf("month")
                        .format("YYYY-MM-DD");

                    const mEnd = moment()
                        .year(year)
                        .month(month)
                        .endOf("month")
                        .format("YYYY-MM-DD");

                    const result = await calculateSalary({
                        start: mStart,
                        end: mEnd
                    });

                    return {
                        month: moment().month(month).format("MMM"),
                        salary: Number(result.totalSalary.toFixed(2))
                    };
                })
            );
        }

        // =============================
        // FINAL RESPONSE
        // =============================
        return resSuccess({
            data: {
                teamMembers,
                employeeData,
                monthlyBarchart,
                totalVisitCount,
                onLeave,
                expense: totalExpense
            },
        });

    } catch (e) {
        console.log("getHrmsInsight error:", e);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const getHrmsLeaderboard = async (req) => {
    try {
        let { a_application_login_id, leaderBoardSelectedDates } = req.body;

        const start = moment(leaderBoardSelectedDates[0]).format("YYYY-MM-DD");
        const end = moment(leaderBoardSelectedDates[1]).format("YYYY-MM-DD");


        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const companyId = findCompanyId.company_masters_id;
        const tenantDB = req.tenantDB;

        const members = await companyVsApplicationLoginModel.findAll({
            where: {
                isDelete: 0,
                company_masters_id: companyId,
            },
            attributes: ["a_application_login_id"],
            raw: true,
        });

        const dateRange = generateDateRange(start, end);

        const leaderboard = [];
        const empPayrollModel = employeePayrollModel(req.tenantDB);
        for (const member of members) {

            const userId = member.a_application_login_id;

            // Get user info
            const user = await loginModel.findOne({
                where: { id: userId },
                attributes: ["username"],
                raw: true,
            });
            const empPayrollData = await empPayrollModel.findOne({
                where: {
                    a_application_login_id: userId,
                    isDelete: 0,
                },
                attributes: ["week_off_days", "min_present_hours"],
                raw: true,
            });
            const username = user?.username || "Unknown";

            const minPresentHours = convertHHMMToDecimal(empPayrollData.min_present_hours || "00:00");

            const weekOffArray = empPayrollData.week_off_days
                ? empPayrollData.week_off_days.split(",").map(Number)
                : [];

            const AttendanceModel = attendanceModel(tenantDB);
            const attendance = await AttendanceModel.findAll({
                where: {
                    a_application_login_id: userId,
                    isDelete: 0,
                    [Op.and]: dateAnd("check_in_out_date_time", start, end),
                },
                raw: true,
            });

            const LeavesModel = leavesModel(tenantDB);
            const leaves = await LeavesModel.findAll({
                where: {
                    a_application_login_id: userId,
                    leave_status: 2,
                    isDelete: 0,
                    [Op.and]: dateAnd("leave_date", start, end),
                },
                raw: true,
            });

            // Maps
            const attendanceMap = {};
            attendance.forEach(a => {
                const date = moment(a.check_in_out_date_time).format("YYYY-MM-DD");
                if (!attendanceMap[date]) attendanceMap[date] = [];
                attendanceMap[date].push(a);
            });

            const leaveMap = {};
            leaves.forEach(l => {
                const date = moment(l.leave_date).format("YYYY-MM-DD");
                leaveMap[date] = true;
            });

            let presentDays = 0;
            let absentDays = 0;
            let leaveDays = Object.keys(leaveMap).length;

            dateRange.forEach(date => {

                const day = moment(date).day();

                if (leaveMap[date]) return; // leave

                if (weekOffArray.includes(day)) return; // week off

                const logs = attendanceMap[date];

                if (logs && logs.length > 0) {

                    let daySeconds = 0;

                    logs.forEach(l => {
                        const [h, m, s] = (l.total_working_hour || "00:00:00").split(":").map(Number);
                        daySeconds += h * 3600 + m * 60 + s;
                    });

                    const hours = daySeconds / 3600;

                    if (!minPresentHours || hours >= minPresentHours) {
                        presentDays++;
                    } else {
                        absentDays++;
                    }

                } else {
                    absentDays++;
                }
            });

            leaderboard.push({
                username,
                presentDays,
                absentDays,
                leaveDays
            });
        }

        return resSuccess({
            data: leaderboard,
        });

    } catch (e) {
        console.log("getHrmsLeaderboard error:", e);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const getHrmsTeamTracking = async (req) => {
    try {
        let { a_application_login_id, date } = req.body;


        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const companyId = findCompanyId.company_masters_id;
        const tenantDB = req.tenantDB;

        const members = await companyVsApplicationLoginModel.findAll({
            where: {
                isDelete: 0,
                company_masters_id: companyId,
            },
            attributes: ["a_application_login_id"],
            raw: true,
        });

        const results = await Promise.all(
            members.map(async (member) => {
                const userId = member.a_application_login_id;

                const user = await loginModel.findOne({
                    where: { id: userId },
                    attributes: ["username"],
                    raw: true,
                });

                const username = user?.username || "Unknown";

                const LocationTracking = trackingModel(tenantDB);
                const location = await LocationTracking.findOne({
                    attributes: ["latitude", "longitude", "address"],
                    where: {
                        a_application_login_id: member.a_application_login_id,
                        [Op.and]: [
                            literal(`DATE(m_timestamp) = '${date}'`)
                        ]
                    },
                    order: [["m_timestamp", "DESC"]],
                });

                return {
                    userId: member.a_application_login_id,
                    username,
                    latitude: location?.latitude || "",
                    longitude: location?.longitude || "",
                    address: location?.address || ""
                };
            })
        );

        return resSuccess({
            data: results,
        });

    } catch (e) {
        console.log("getHrmsTeamTracking error:", e);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const getProductionInsight = async (req) => {
    try {
        let { a_application_login_id, selectedDates, leaderBoardSelectedDates } = req.body;

        const start = moment(selectedDates[0]).format("YYYY-MM-DD");
        const end = moment(selectedDates[1]).format("YYYY-MM-DD");

        const startDashDate = moment(leaderBoardSelectedDates[0]).format("YYYY-MM-DD");
        const endDashDate = moment(leaderBoardSelectedDates[1]).format("YYYY-MM-DD");

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const companyId = findCompanyId.company_masters_id;
        const tenantDB = req.tenantDB;
        const CartItem = cartItemModel(req.tenantDB);

        // Count Product
        const ProductModel = productModel(tenantDB);
        const product = await ProductModel.findAll({
            where: {
                isDelete: 0,
                [Op.and]: dateAnd("created_date_time", start, end),
            },
            attributes: ["id", "min_stock_quantity", "max_stock_quantity", "net_rate"],
            raw: true,
        });

        const productCount = product.length;

        // Count Product BOM
        const BOMModel = productBillOfMaterialModel(tenantDB);
        const bomCount = await BOMModel.count({
            where: {
                isDelete: 0,
                [Op.and]: dateAnd("created_date_time", start, end),
            },
        });

        const JobModel = JobCardsModel(tenantDB);
        const jobCount = await JobModel.count({
            where: {
                isDelete: 0,
                [Op.and]: dateAnd("created_date_time", start, end),
            },
        });

        const allJob = await JobModel.findAll({
            where: {
                isDelete: 0,
                [Op.and]: dateAnd("created_date_time", startDashDate, endDashDate),
            },
            raw: true,
        });

        const loginIds = [...new Set(allJob.map(j => j.a_application_login_id))];

        const users = await loginModel.findAll({
            where: { id: loginIds },
            attributes: ["id", "username"],
            raw: true,
        });

        const userMap = {};
        users.forEach(u => { userMap[u.id] = u.username; });

        const jobsWithUser = allJob.map(job => ({
            ...job,
            username: userMap[job.a_application_login_id] || null,
        }));

        let lowStockCount = 0;
        let highStockCount = 0;

        await Promise.all(
            product.map(async (item) => {

                // OPENING STOCK (before start date)

                const openingData = await CartItem.findAll({
                    where: {
                        isDelete: 0,
                        item_product_id: item.id,
                        cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
                        cart_date: { [Op.lt]: start },
                    },
                    raw: true,
                });

                const calOpenQty = openingData.reduce((total, it) => {
                    if (
                        (it.cart_type == 4 && it.reference_type != 8) ||
                        it.cart_type == 6 ||
                        it.cart_type == 8 ||
                        it.cart_type == 10
                    ) {
                        return total + it.item_qty;
                    } else if (
                        (it.cart_type === 3 && it.reference_type != 9) ||
                        it.cart_type === 7 ||
                        it.cart_type === 9 ||
                        it.cart_type == 11
                    ) {
                        return total - it.item_qty;
                    }
                    return total;
                }, 0);

                // CURRENT RANGE DATA
                const resultCartItem = await CartItem.findAll({
                    where: {
                        isDelete: 0,
                        item_product_id: item.id,
                        cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
                        cart_date: { [Op.between]: [start, end] },
                    },
                    raw: true,
                });

                const closingQtyMovement = resultCartItem.reduce((total, it) => {
                    if (
                        (it.cart_type == 4 && it.reference_type != 8) ||
                        it.cart_type == 6 ||
                        it.cart_type == 8 ||
                        it.cart_type == 10
                    ) {
                        return total + it.item_qty;
                    } else if (
                        (it.cart_type === 3 && it.reference_type != 9) ||
                        it.cart_type === 7 ||
                        it.cart_type === 9 ||
                        it.cart_type == 11
                    ) {
                        return total - it.item_qty;
                    }
                    return total;
                }, 0);

                const calClosingQty = calOpenQty + closingQtyMovement;

                // if (calClosingQty > 0) {
                //     const rate = Number(item.net_rate) || 0;
                //     totalStockValue += calClosingQty * rate;
                // }

                // COUNT ke liye condition
                if (!(item.min_stock_quantity == 0 && item.max_stock_quantity == 0)) {

                    if (calClosingQty > 0 && calClosingQty <= item.min_stock_quantity) {
                        lowStockCount++;
                    }
                    else if (calClosingQty > item.max_stock_quantity) {
                        highStockCount++;
                    }
                }
            })
        );

        const result = await CartItem.findOne({
            attributes: [
                [fn("SUM", literal("item_qty * item_net_rate")), "total_stock_value"]
            ],
            where: {
                isDelete: 0,
                cart_type: {
                    [Op.in]: [3, 4, 6, 7, 8, 9, 10, 11]
                },
                [Op.or]: [
                    {
                        [Op.and]: [
                            { cart_type: 3 },
                            { reference_type: { [Op.ne]: 9 } }
                        ]
                    },
                    {
                        [Op.and]: [
                            { cart_type: 4 },
                            { reference_type: { [Op.ne]: 8 } }
                        ]
                    },
                    {
                        cart_type: {
                            [Op.notIn]: [3, 4]
                        }
                    }
                ]
            },
            raw: true
        });

        const totalStockValue = Number(result.total_stock_value || 0);

        return resSuccess({
            data: {
                productCount,
                bomCount,
                lowStockCount,
                highStockCount,
                totalStockValue,
                jobCount,
                allJob: jobsWithUser,
            },
        });

    } catch (e) {
        console.log("getProductionInsight error:", e);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};