// reportType -> how to pull ALL rows for it, reusing the exact existing
// per-report service function (no query logic duplicated here). Add an
// entry per report as it's migrated to the generic export API; reportType
// keys match the `useColumnPreferences` reportKey each report already uses
// on the frontend (already a stable, per-report, server-persisted id).
//
// A report whose frontend always supplies `rows` directly (grid selection,
// or a pre-pivoted client fetch too different in shape to reuse here - e.g.
// All Task Report, Category Pending, Category Sales & Purchase, Customer
// Sales Purchase Report, Product Pending) needs no entry at all - the
// generic export service skips the registry whenever `rows` is provided.
import { getAllContactReport } from "./allContactReportServices.js";
import { getAccountOutstandingReport, getAllAccountTranstionsReport } from "./accountReportServices.js";
import { getTeamPerformanceReport } from "./teamPerformanceReportServices.js";
import { getTeamAllCarts } from "./teamAllCartsReportServices.js";
import { getCallReport } from "./allCallReportServices.js";
import { getVisitReport } from "./allVisitReportServices.js";
import { getTeamReminderReport } from "./reminderReportService.js";
import { inquiryReport } from "./inquiryReportServices.js";
import { getAllContactChainWise } from "./chainContactReportService.js";
import {
  getEmployeeAccountOutstandingReport,
  getEmployeeAccountTranctionReport,
} from "./employeeTransactionReportService.js";
import { detailedExpenseGet } from "./expenseDetailedReportServices.js";
import { teamDayExpense } from "./teamDayExpenseServices.js";
import { salaryRegistrationGet } from "./SalaryRegisterReportServices.js";
import { lableReport } from "./lableWiseReportServices.js";
import { productInventoryReport } from "./productInventoryReportServices.js";
import { getProductSalesPurchase } from "./productSalesPurchaseServices.js";
import { statusWiseReport } from "./statusWiseReportServices.js";
import { sourceReport } from "./sourceReportServices.js";
import { statusWiseContactCountReportGet } from "./statusWiseContactCountReportServices.js";
import { getTargetIncentiveReport } from "./targetIncentiveReportServices.js";
import { getTeamPendingWorkReport } from "./teamPendingWorkReportServices.js";
import { processAttendanceGet } from "./processAttendanceReportServices.js";

// Most report services return { data: { item: [...] } }; a few vary:
// - Account Outstanding pre-aggregates then slices in memory -> { data: [...] }
// - some return { data: { items: [...] } } (plural)
// - some return { data: { data: [...] } } (double-nested)
const itemArray = (result) => result?.data?.item || [];
const itemsArray = (result) => result?.data?.items || [];
const flatArray = (result) => (Array.isArray(result?.data) ? result.data : []);
const nestedDataArray = (result) => result?.data?.data || [];

// All Call Report groups rows as [{ user, calls: [...] }] server-side;
// flatten to one row per call, same shape the old client export produced.
const CALL_TYPE_LABELS = {
  1: "Incoming",
  2: "Outgoing",
  3: "Missed",
  4: "Rejected",
  5: "Blocked",
  7: "Outgoing Call Not Connected",
  9: "Answered Externally",
};
const flattenCallReportRows = (result) => {
  const groups = flatArray(result);
  const rows = [];
  for (const group of groups) {
    const user = group.user?.toJSON ? group.user.toJSON() : group.user;
    for (const raw of group.calls || []) {
      const call = raw?.toJSON ? raw.toJSON() : raw;
      const callType =
        typeof call.call_type === "number" ? call.call_type : parseInt(call.call_type || "0", 10);
      rows.push({
        id: call.id,
        call_type: call.call_type,
        call_status: CALL_TYPE_LABELS[callType] || "Unknown",
        call_date_time: call.call_date_time,
        duration: call.duration,
        mobile_number: call.mobile_number,
        remark: call.remark,
        call_name: call.call_name,
        username: user?.username || "",
        person_name: call.person_name,
        start_date: call.start_date,
        s_timestemp: call.s_timestemp,
        source_name: call.contactDetails?.source_name || "",
        source_colour: call.contactDetails?.source_colour || "",
        status_name: call.contactDetails?.status_name || "",
        status_colour: call.contactDetails?.status_colour || "",
        lable_name: call.contactDetails?.lable_name || "",
        lable_colour: call.contactDetails?.lable_colour || "",
      });
    }
  }
  return rows;
};

// All Visit Report groups rows as [{ user, visits: [...] }] server-side;
// flatten to one row per visit, porting the same duration/day-name helpers
// the frontend view still uses for on-screen rendering (allVisitReportView.tsx).
const calculateDuration = (startDate, endDate) => {
  if (!endDate || endDate === "0000-00-00" || !startDate) return "-";
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return "-";
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return "-";
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  } catch {
    return "-";
  }
};
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const getDayName = (dateStr) => {
  if (!dateStr || dateStr === "-" || String(dateStr).includes("undefined") || dateStr === "0000-00-00") {
    return "-";
  }
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "-";
    return DAY_NAMES[date.getDay()];
  } catch {
    return "-";
  }
};
const flattenVisitReportRows = (result) => {
  const groups = flatArray(result);
  const rows = [];
  for (const group of groups) {
    for (const raw of group.visits || []) {
      const item = raw?.toJSON ? raw.toJSON() : raw;
      rows.push({
        ...item,
        username: group.user?.username || "",
        status: !item.end_date || item.end_date === "0000-00-00" ? "Active" : "Complete",
        duration: calculateDuration(item.start_date, item.end_date),
        start_day: getDayName(item.start_date),
        end_day: getDayName(item.end_date),
      });
    }
  }
  return rows;
};

// Pending Order / Pending Purchase reuse getTeamAllCarts, but the on-screen
// grid applies a small field-aliasing pass the raw service response doesn't
// have under these exact keys - replicate it so cart_status/update_Date_time
// columns aren't blank.
const flattenCart = (row) => ({
  ...row,
  cart_status: row.statusDetails?.name || row.cart_status,
  update_Date_time: row.update_Date_time || row.approve_date_time,
});

// Product Sales & Purchase: backend returns 5 parallel arrays (quotation,
// salesOrder, salesInvoice, purchaseInvoice, purchaseOrder); pivot by
// product into one row per product with a composite "qty(amount)" cell per
// document type, same as the old client-side pivotData().
const PRODUCT_SALES_PURCHASE_SOURCES = {
  quotation: "quotation",
  salesOrder: "salesorder",
  salesInvoice: "salesinvoice",
  purchaseInvoice: "purchaseinvoice",
  purchaseOrder: "purchaseorder",
};
const pivotProductSalesPurchase = (result) => {
  const data = result?.data || {};
  const grouped = {};
  for (const [sourceKey, fieldKey] of Object.entries(PRODUCT_SALES_PURCHASE_SOURCES)) {
    for (const item of data[sourceKey] || []) {
      const key = `${item.item_product_id}_${item.item_product_name}`;
      if (!grouped[key]) {
        grouped[key] = {
          item_product_id: item.item_product_id,
          item_product_name: item.item_product_name,
          item_product_code: item.item_product_code,
          item_category_name: item.item_category_name,
          item_unit_name: item.item_unit_name,
        };
      }
      grouped[key][fieldKey] = `${item.total_quantity}(${item.total_amount})`;
    }
  }
  return Object.values(grouped);
};

// Status Wise Report: nested data.item.internal/external.{support_ticket,
// normal_task} - pivot by status name into flat {group,name,support_ticket,
// task} rows, matching the correct getExportRows() shape Print already used
// (the OLD Excel export used a different/wrong flatten here - fixed).
const STATUS_WISE_GROUPS = [
  { label: "Internal Status", key: "internal" },
  { label: "External Status", key: "external" },
];
const pivotStatusWiseReport = (result) => {
  const item = result?.data?.item;
  if (!item) return [];
  const rows = [];
  for (const { label, key } of STATUS_WISE_GROUPS) {
    const stMap = new Map();
    const tkMap = new Map();
    (item[key]?.support_ticket || []).forEach((i) => stMap.set(i.name, i.count ?? 0));
    (item[key]?.normal_task || []).forEach((i) => tkMap.set(i.name, i.count ?? 0));
    for (const name of new Set([...stMap.keys(), ...tkMap.keys()])) {
      rows.push({ group: label, name, support_ticket: stMap.get(name) ?? 0, task: tkMap.get(name) ?? 0 });
    }
  }
  return rows;
};

export const reportExportRegistry = {
  all_contact_report: {
    fetchPage: (req) => getAllContactReport(req),
    extractRows: itemArray,
  },
  all_deleted_contact_report: {
    fetchPage: (req) => getAllContactReport({ ...req, body: { ...req.body, deleted_flag: 1 } }),
    extractRows: itemArray,
  },
  chain_wise_contact_report: {
    fetchPage: (req) => getAllContactChainWise(req),
    extractRows: itemArray,
  },
  all_call_report: {
    fetchPage: (req) => getCallReport(req),
    extractRows: flattenCallReportRows,
  },
  all_visit_report: {
    fetchPage: (req) => getVisitReport(req),
    extractRows: flattenVisitReportRows,
  },
  all_reminder_report: {
    fetchPage: (req) => getTeamReminderReport(req),
    extractRows: nestedDataArray,
  },
  all_inquiry_report: {
    fetchPage: (req) => inquiryReport(req),
    extractRows: itemsArray,
  },

  // Cart family - all backed by getTeamAllCarts, dispatched by `type`
  // (pageIdMap confirmed in teamAllCartsReportServices.js:54-65).
  quotation_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 1 } }),
    extractRows: itemArray,
  },
  sales_order_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 2 } }),
    extractRows: itemArray,
  },
  sales_invoice_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 3 } }),
    extractRows: itemArray,
  },
  purchase_order_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 4 } }),
    extractRows: itemArray,
  },
  purchase_invoice_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 5 } }),
    extractRows: itemArray,
  },
  return_sales_invoice_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 6 } }),
    extractRows: itemArray,
  },
  return_purchase_invoice_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 7 } }),
    extractRows: itemArray,
  },
  inward_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 8 } }),
    extractRows: itemArray,
  },
  dispatch_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 9 } }),
    extractRows: itemArray,
  },
  proforma_invoice_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 12 } }),
    extractRows: itemArray,
  },
  // Unreachable in the current UI (ReportsModel.tsx's entry is commented
  // out) - registered anyway since it costs nothing and the view already
  // wires the shared export service directly.
  detailed_order_report: {
    fetchPage: (req) => getTeamAllCarts(req),
    extractRows: itemArray,
  },
  pending_order_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 2 } }),
    extractRows: (result) => itemArray(result).map(flattenCart),
  },
  pending_purchase_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 5 } }),
    extractRows: (result) => itemArray(result).map(flattenCart),
  },

  account_outstanding_report: {
    fetchPage: (req) => getAccountOutstandingReport(req),
    extractRows: flatArray,
  },
  account_credit_report: {
    fetchPage: (req) => getAllAccountTranstionsReport({ ...req, body: { ...req.body, credit_debit_flag: 1 } }),
    extractRows: nestedDataArray,
  },
  account_debit_report: {
    fetchPage: (req) => getAllAccountTranstionsReport({ ...req, body: { ...req.body, credit_debit_flag: 2 } }),
    extractRows: nestedDataArray,
  },
  all_account_report: {
    fetchPage: (req) => getAllAccountTranstionsReport(req),
    extractRows: nestedDataArray,
  },
  employee_account_outstanding_report: {
    fetchPage: (req) => getEmployeeAccountOutstandingReport(req),
    extractRows: flatArray,
  },
  employee_account_transaction_report: {
    fetchPage: (req) => getEmployeeAccountTranctionReport(req),
    extractRows: nestedDataArray,
  },
  expense_detailed_report: {
    fetchPage: (req) => detailedExpenseGet(req),
    extractRows: itemArray,
  },
  team_day_wise_expense_report: {
    fetchPage: (req) => teamDayExpense(req),
    extractRows: itemArray,
  },
  salary_register_report: {
    fetchPage: (req) => salaryRegistrationGet(req),
    extractRows: itemArray,
  },

  label_wise_report: {
    fetchPage: (req) => lableReport(req),
    extractRows: itemArray,
  },
  product_inventory_report: {
    fetchPage: (req) => productInventoryReport(req),
    extractRows: itemsArray,
  },
  product_sales_purchase_report: {
    fetchPage: (req) => getProductSalesPurchase(req),
    extractRows: pivotProductSalesPurchase,
  },
  status_wise_report: {
    fetchPage: (req) => statusWiseReport(req),
    extractRows: pivotStatusWiseReport,
  },
  source_wise_report: {
    fetchPage: (req) => sourceReport(req),
    extractRows: itemArray,
  },
  status_wise_statistics_report: {
    fetchPage: (req) => statusWiseContactCountReportGet(req),
    extractRows: itemArray,
  },
  target_incentive_report: {
    fetchPage: (req) => getTargetIncentiveReport(req),
    extractRows: itemArray,
  },
  team_pending_work_report: {
    fetchPage: (req) => getTeamPendingWorkReport(req),
    extractRows: itemArray,
  },
  process_attendance_report: {
    fetchPage: (req) => processAttendanceGet(req),
    extractRows: itemArray,
  },

  team_performance_report: {
    fetchPage: (req) => getTeamPerformanceReport(req),
    extractRows: itemArray,
  },
};
