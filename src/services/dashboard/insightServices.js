import moment from "moment";
import Sequelize, { Op } from "sequelize";
import sequelize from "../../config/sequelize.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { callhistoryModel } from "../../models/activities/callhistoryModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { reminderMessagesModel } from "../../models/activities/reminderMessagesModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import { visitsModel } from "../../models/activities/visitModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import currencyModel from "../../models/configuration/currencyModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
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

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

export const getAllInsight = async (req) => {
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

      // 👇 ADD THIS BLOCK
      console.log("INSIGHT-DEBUG", {
        type,
        page_id: pageidSalesObj[type],
        a_application_login_id,
        companyId,
        data,
        showAllData: rights?.showAllData,
        showPersonalData: rights?.showPersonalData,
        // rawRights: rights, // <- the entire object so we see every flag
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
      },
    });
  } catch (e) {
    console.log("getAllInsight error:", e);
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};
