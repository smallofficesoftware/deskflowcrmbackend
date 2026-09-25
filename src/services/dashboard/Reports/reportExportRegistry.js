// reportType -> how to pull ALL rows for it, reusing the exact existing
// per-report service function (no query logic duplicated here). Add an
// entry per report as it's migrated to the generic export API; reportType
// keys match the `useColumnPreferences` reportKey each report already uses
// on the frontend (already a stable, per-report, server-persisted id).
//
// A report whose frontend always supplies `rows` directly (grid selection)
// needs no entry at all - the generic export service skips the registry
// whenever `rows` is provided.
import moment from "moment";
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
import { getCategorySalesPurchase } from "./categorySalesPurchaseServices.js";
import { statusWiseReport } from "./statusWiseReportServices.js";
import { sourceReport } from "./sourceReportServices.js";
import { statusWiseContactCountReportGet } from "./statusWiseContactCountReportServices.js";
import { getTargetIncentiveReport } from "./targetIncentiveReportServices.js";
import { getTeamPendingWorkReport } from "./teamPendingWorkReportServices.js";
import { getTeamAttendanceReport } from "./teamAttendanceReportServices.js";
import { processAttendanceGet } from "./processAttendanceReportServices.js";
import { getTeamTaskReport } from "./teamAllTaskReportServices.js";
import { getCustomerSalesPurchaseReport } from "./customerSalesPurchaseReportServices.js";
import { fetchReportBuilderExportPage } from "../../report_builder/reportDefinitionServices.js";

// Most report services return { data: { item: [...] } }; a few vary:
// - Account Outstanding pre-aggregates then slices in memory -> { data: [...] }
// - some return { data: { items: [...] } } (plural)
// - some return { data: { data: [...] } } (double-nested)
const itemArray = (result) => result?.data?.item || [];
const itemsArray = (result) => result?.data?.items || [];
const nestedDataArray = (result) => result?.data?.data || [];
// Call/Visit/Account Outstanding/Employee Account Outstanding moved from a
// flat { data: [...] } to { data: { data: [...], total } } - accept both.
const flatArray = (result) => (Array.isArray(result?.data) ? result.data : nestedDataArray(result));

// All Reminder Report always appended a "Total Reminders: N" summary row
// after the data - ported from the old client-side exportExcel.
const appendReminderTotalRow = (rows) => {
  if (!rows.length) return rows;
  return [
    ...rows,
    {
      id: `Total Reminders: ${rows.length}`,
      contact_name: "",
      reminder_data_time: "",
      status_display: "",
      completed_date_time: "",
      assigned_to_name: "",
      created_by_username: "",
      remark: "",
    },
  ];
};

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
// Ported from calculateDuration1 in AllCallReportView.tsx - raw `duration`
// is either seconds (number) or a "MM:SS" string; both render as "Xh Ym Zs".
const formatCallDuration = (input) => {
  if (!input) return "-";
  if (typeof input === "number") {
    const hours = Math.floor(input / 3600);
    const minutes = Math.floor((input % 3600) / 60);
    const seconds = Math.floor(input % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (typeof input === "string" && input.includes(":")) {
    const parts = input.split(":");
    if (parts.length !== 2) return "-";
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (isNaN(minutes) || isNaN(seconds)) return "-";
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds}s`;
  }
  return "-";
};
// ─── Grid display derivations ───────────────────────────────────────────
// Export columns reuse each grid's own column keys, but many grid cells
// render a value derived from other row fields (the view's
// getExportCellValue / column `body`). The raw service row has nothing at
// those keys, so the export came out blank, a raw id, or "[object Object]".
// The helpers below port those derivations so a server-side full export
// matches what the grid (and Print) shows.

// Same "DD/MM/YYYY - hh:mm A" shape as the grids' formatDateTime.
const formatGridDateTime = (value) => {
  if (!value || value === "0000-00-00") return "-";
  const parsed = moment(value);
  return parsed.isValid() ? parsed.format("DD/MM/YYYY - hh:mm A") : "-";
};

const stripHtml = (value) =>
  value ? String(value).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() || "-" : "-";

const toPlain = (row) => (row?.toJSON ? row.toJSON() : row);

// "Company (Name) - Mobile" - Account Credit/Debit/All Account grids.
const composeAccountContact = (txn) => {
  const company = txn.contact_companyName || "";
  const contact = txn.contact_name || "";
  const mobile = txn.contact_mobileNumber || "";
  const parts = [];
  if (company || contact) parts.push(company && contact ? `${company} (${contact})` : company || contact);
  if (mobile) parts.push(mobile);
  return parts.length ? parts.join(" - ") : "-";
};
const deriveAccountTxnRows = (typeLabel) => (result) =>
  nestedDataArray(result).map((raw) => {
    const txn = toPlain(raw);
    return {
      ...txn,
      contact_masters_id: composeAccountContact(txn),
      ...(typeLabel ? { typeItem: typeLabel } : {}),
      amount: txn.amountwithcurrency || txn.amount,
      remark: stripHtml(txn.remark),
    };
  });

const deriveEmployeeTxnRow = (raw) => {
  const txn = toPlain(raw);
  return {
    ...txn,
    contact_masters_id: [txn.username, txn.recovery_mobile].filter(Boolean).join(" - ") || "-",
    amount: txn.amountwithoutcurrency || txn.amount,
    remark: stripHtml(txn.remark),
  };
};

const deriveInquiryRow = (raw) => {
  const row = toPlain(raw);
  const labels = Array.isArray(row.label_name) ? row.label_name : [];
  const labelText = labels.length ? labels.map((l) => l.name).join(", ") : "-";
  return {
    ...row,
    customerName: row.person_name || "-",
    customerNumber: row.mobile_number || "-",
    lable: labelText,
    label_name: labelText,
  };
};

const EXPENSE_STATUS_LABELS = { 1: "Pending", 2: "Approved", 3: "Rejected" };
const deriveExpenseRow = (raw) => {
  const row = toPlain(raw);
  return {
    ...row,
    employee: row.created_by_username ?? "-",
    status: EXPENSE_STATUS_LABELS[row.expense_status] || "-",
  };
};

const deriveReminderRow = (raw) => {
  const row = toPlain(raw);
  return {
    ...row,
    reminder_data_time: formatGridDateTime(row.reminder_data_time),
    completed_date_time: formatGridDateTime(row.completed_date_time),
    remark: stripHtml(row.remark),
  };
};

const joinIfArray = (value) => (Array.isArray(value) ? value.join(", ") : value || "-");
const deriveTaskRow = (raw) => {
  const row = toPlain(raw);
  const derived = {
    ...row,
    id: row.id ? String(row.id) : "XXXXXXX",
    status_name: row.stage_status_name || row.status_name || "-",
    task_remark: stripHtml(row.task_remark),
    selected_days_names: joinIfArray(row.selected_days_names),
    assigned_team_member_names: joinIfArray(row.assigned_team_member_names),
    task_fromdate: formatGridDateTime(row.task_fromdate),
    task_enddate: formatGridDateTime(row.task_enddate),
  };
  // Custom-form columns are keyed customForm_<field id> on the grid.
  for (const cf of row.customForm || []) derived[`customForm_${cf.id}`] = cf.value || "-";
  return derived;
};

const deriveContactDateRow = (raw) => {
  const row = toPlain(raw);
  return { ...row, created_date_time: formatGridDateTime(row.created_date_time) };
};

// Cart family: line items as "Product (code) | qty | rate" lines, amount
// columns without the currency prefix (the *_wo_c twins the grid exports),
// formatted dates. `withRate: false` for Pending Order/Purchase, whose
// grids show qty only.
const formatCartItems = (items, withRate = true) =>
  (Array.isArray(items) ? items : [])
    .map((i) => {
      const name = i.item_product_name || "";
      const code = i.item_product_code || "";
      const product = code ? `${name} (${code})` : name;
      return withRate ? `${product} | ${i.item_qty} | ${i.item_rate}` : `${product} | ${i.item_qty}`;
    })
    .join("\n") || "-";
const CART_AMOUNT_KEYS = ["taxable_amt", "gst_amt", "tcs_amt", "round_off", "grand_total"];
const TRANSACTION_MODE_LABELS = { 1: "Cash Memo", 2: "Debit Memo" };
const deriveCartRow = (row, { withRate = true, transactionMode = false } = {}) => {
  const derived = {
    ...row,
    items: formatCartItems(row.items, withRate),
    created_date_time: formatGridDateTime(row.created_date_time),
    update_Date_time: formatGridDateTime(row.update_Date_time),
  };
  for (const key of CART_AMOUNT_KEYS) {
    if (row[`${key}_wo_c`] !== undefined) derived[key] = `${row[`${key}_wo_c`]}`;
  }
  if (transactionMode) derived.transaction_mode = TRANSACTION_MODE_LABELS[row.transaction_mode] || "-";
  return derived;
};
// compose: the existing per-report cart_number/to_customer_name
// composition (composeCartDisplayFields etc.), applied first.
const cartRows = (compose, opts) => (result) =>
  itemArray(result).map((raw) => {
    const row = toPlain(raw);
    return deriveCartRow(compose ? compose(row) : row, opts);
  });

const withProductCode = (row) => ({
  ...row,
  item_product_name: `${row.item_product_name ?? "-"}${row.item_product_code ? ` - ${row.item_product_code}` : ""}`,
});

const SALARY_MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const deriveSalaryRow = (raw) => {
  const row = toPlain(raw);
  return {
    ...row,
    year: `${SALARY_MONTHS[row.month] || row.month || ""} - ${row.year ?? ""}`,
    added_date: row.added_date ? moment(row.added_date).format("DD/MM/YYYY") : "00/00/0000",
  };
};

// Process Attendance: status counts keyed by grid column, plus one column
// per date (keyed YYYY-MM-DD) showing that day's status code.
const PROCESS_DAY_STATUS = { 1: "P", 2: "HD", 3: "A", 4: "L", 5: "WO", 6: "PH", 7: "WOWO", 8: "WOPH" };
const PROCESS_STATUS_COLUMNS = {
  present: "P", half_day: "HD", absent: "A", leave: "L", week_off: "WO",
  holiday: "PH", work_on_week_off: "WOWO", work_on_public_holiday: "WOPH",
};
const deriveProcessAttendanceRow = (raw) => {
  const row = toPlain(raw);
  const derived = { ...row };
  for (const [key, code] of Object.entries(PROCESS_STATUS_COLUMNS)) {
    derived[key] = String(row.status_count?.[code] ?? "-");
  }
  for (const rawDay of row.presentDates || []) {
    const day = toPlain(rawDay);
    derived[moment(day.date).format("YYYY-MM-DD")] = PROCESS_DAY_STATUS[day.day_status] ?? "-";
  }
  return derived;
};

const formatInr = (n) => Number(n || 0).toLocaleString("en-IN");
const deriveTargetIncentiveRow = (raw) => {
  const item = toPlain(raw);
  const sym = item.currency_symbol || "₹";
  return {
    ...item,
    target_type_label: item.target_type_label || "Invoice",
    target_achieved_count: item.target_count > 0 ? `${item.target_count} / ${item.achieved_count || 0}` : "-",
    target_achieved_value:
      item.target_value > 0 ? `${sym}${formatInr(item.target_value)} / ${sym}${formatInr(item.achieved_value)}` : "-",
    achievement_percentage: `${item.achievement_percentage ?? item.achievement_pct ?? 0}%`,
    incentive_rule:
      item.incentive_type === 1
        ? `${item.incentive_value}%`
        : item.incentive_type === 2
          ? `${sym}${item.incentive_value} (Flat)`
          : "None",
    earned_incentive: `${sym}${formatInr(item.incentive_amount ?? item.earned_incentive)}`,
  };
};

// Customer Sales Purchase: s_no is the running row number across pages.
const formatMoney2 = (n) =>
  Math.abs(Number(n || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const customerSalesPurchaseRows = (result, page) => {
  const sym = result?.data?.summary?.currency_symbol || "₹";
  const offset = Number(page?.body?.ul) || 0;
  return itemArray(result).map((raw, idx) => {
    const item = toPlain(raw);
    const net = Number(item.net_balance || 0);
    return {
      ...item,
      s_no: offset + idx + 1,
      total_sales: `${sym}${formatMoney2(item.total_sales)}`,
      total_purchase: `${sym}${formatMoney2(item.total_purchase)}`,
      net_balance: net < 0 ? `(${sym}${formatMoney2(net)})` : `${sym}${formatMoney2(net)}`,
    };
  });
};

// "count (amount)" pairs - Team Pending Work / Team Performance grids.
const deriveTeamPendingRow = (raw) => {
  const r = toPlain(raw);
  const pair = (o) => `${o?.count ?? "-"} ( ${o?.amount ?? "-"})`;
  return {
    ...r,
    quotation_total: pair(r.quotation),
    salesOrder_total: pair(r.order),
    salesInvoice_total: pair(r.sell_invoice),
    purchaseInvoice_total: pair(r.purchase_invoice),
    purchaseOrder_total: pair(r.purchase_order),
    pendingReminder_total: `${r.pendingReminder ?? "-"}`,
    reqExpenseAmount: `${r.reqExpenseAmount ?? "-"}`,
  };
};
const deriveTeamPerformanceRow = (raw) => {
  const r = toPlain(raw);
  const pair = (o) => `${o?.count ?? "-"} (${o?.amount ?? "-"})`;
  return {
    ...r,
    quotation: pair(r.quotation),
    order: pair(r.order),
    sell_invoice: pair(r.sell_invoice),
    purchase_order: pair(r.purchase_order),
    purchase_invoice: pair(r.purchase_invoice),
    expense: String(r.expense?.PassedAmount ?? "-"),
    account_credit: pair(r.account?.credit),
    account_debit: pair(r.account?.debit),
  };
};

// Team Day Wise Expense: one row per member, one column per date keyed
// combined_amount_YYYY-MM-DD = "₹requested(₹passed)", plus a total -
// ported from the grid's own grouping in teamDayExpenseView.tsx.
const parseAmount = (amount) => {
  if (amount == null) return { value: 0, symbol: "₹" };
  const str = String(amount);
  const match = str.match(/[^0-9.-]+/);
  const symbol = match ? match[0].trim() || "₹" : "₹";
  return { value: Number(str.replace(/[^0-9.-]+/g, "")) || 0, symbol };
};
const teamDayExpenseRows = (result) =>
  itemArray(result).map((raw) => {
    const member = toPlain(raw);
    let symbol = "₹";
    let totalRequested = 0;
    let totalPassed = 0;
    const byDate = {};
    for (const exp of member.result || []) {
      const key = `combined_amount_${moment(exp.expense_date).format("YYYY-MM-DD")}`;
      const requested = parseAmount(exp.requested_amount);
      const passed = parseAmount(exp.pass_amount);
      if (requested.symbol !== "₹" && symbol === "₹") symbol = requested.symbol;
      if (passed.symbol !== "₹" && symbol === "₹") symbol = passed.symbol;
      byDate[key] = byDate[key] || { requested: 0, passed: 0 };
      byDate[key].requested += requested.value;
      byDate[key].passed += passed.value;
      totalRequested += requested.value;
      totalPassed += passed.value;
    }
    const row = {
      username: member.username || "-",
      total_combined_amount: `${symbol}${totalRequested}(${symbol}${totalPassed})`,
    };
    for (const [key, v] of Object.entries(byDate)) row[key] = `${symbol}${v.requested}(${symbol}${v.passed})`;
    return row;
  });

const flattenCallReportRows = (result) => {
  const groups = flatArray(result);
  const rows = [];
  for (const group of groups) {
    const user = group.user?.toJSON ? group.user.toJSON() : group.user;
    for (const raw of group.calls || []) {
      const call = raw?.toJSON ? raw.toJSON() : raw;
      const callType =
        typeof call.call_type === "number" ? call.call_type : parseInt(call.call_type || "0", 10);
      const callStatus = CALL_TYPE_LABELS[callType] || "Unknown";
      rows.push({
        id: call.id,
        call_type: call.call_type,
        call_status: callStatus,
        // Export columns reuse the grid's keys: "status" / "start_date" /
        // "person_name" render call_status / call_date_time / call_name on
        // screen (getExportCellValue in AllCallReportView.tsx).
        status: callStatus,
        call_date_time: call.call_date_time,
        duration: formatCallDuration(call.duration),
        mobile_number: call.mobile_number,
        remark: call.remark,
        call_name: call.call_name,
        username: user?.username || "",
        person_name: call.call_name || call.person_name,
        start_date: formatGridDateTime(call.call_date_time),
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
        start_date: formatGridDateTime(item.start_date),
        end_date: formatGridDateTime(item.end_date),
        visit_image: "-",
        location: "-",
      });
    }
  }
  return rows;
};

// Pending Order / Pending Purchase reuse getTeamAllCarts, but the on-screen
// grid applies a small field-aliasing pass the raw service response doesn't
// have under these exact keys - replicate it so cart_status/update_Date_time
// columns aren't blank. Also had the same missing-Excel-branch composition
// gap as composeCartDisplayFields (no phone in to_customer_name here).
const flattenCart = (row) => ({
  ...row,
  cart_status: row.statusDetails?.name || row.cart_status,
  update_Date_time: row.update_Date_time || row.approve_date_time,
  cart_number: `${row.cart_number || "XXXXXXX"} (${row.is_approve?.name || "-"})`,
  to_customer_name: `${row.to_customer_company_name || ""}(${row.to_customer_name || ""})`,
});

// Purchase Order, Dispatch, Proforma Invoice, detailed Order Report:
// getExportCellValue's Excel branch composed cart_number with the approval
// status suffix and to_customer_name with the company name prefix (unlike
// the sibling cart reports, whose Excel branch used the plain fields) -
// port that composition onto the same keys so it lands in the existing
// cart_number/to_customer_name columns without needing new ones.
const composeCartDisplayFields = (row) => ({
  ...row,
  cart_number: `${row.cart_number || "XXXXXXX"} (${row.is_approve?.name || "-"})`,
  to_customer_name: `${row.to_customer_company_name || ""}(${row.to_customer_name || "-"})`,
});

// Sales Order, Quotation, Sales Invoice: same missing-Excel-branch gap as
// composeCartDisplayFields above, but their to_customer_name composition
// also folds in the phone number.
const composeCartDisplayFieldsWithPhone = (row) => ({
  ...row,
  cart_number: `${row.cart_number || "XXXXXXX"} (${row.is_approve?.name || "-"})`,
  to_customer_name: `${row.to_customer_company_name || "-"} (${row.to_customer_name || "-"}) - ${row.to_customer_phone || "-"}`,
});

// Attendance & Salary Report: the on-screen grid is fixed summary columns,
// but its export interleaves one column PER DATE in the selected range
// (not derivable from a static columns list) - the frontend builds
// `columns` dynamically for this reportType instead of using
// useColumnPreferences directly, and this extractRows flattens each row's
// attendanceData[] into matching per-date keys, porting the exact
// cell-format logic (status + leave_type + check-in/out time pairs) and
// the total-working-hours computation from the old client-side
// exportExcel in AttendanceReportView.tsx.
const pad2 = (n) => String(n).padStart(2, "0");
const attendanceDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const attendanceDateRange = (selectedDates) => {
  if (!Array.isArray(selectedDates) || selectedDates.length !== 2) return [];
  let start = new Date(selectedDates[0]);
  let end = new Date(selectedDates[1]);
  if (start > end) [start, end] = [end, start];
  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};
const parseWorkingHoursToMinutes = (timeStr) => {
  const [h, m, s] = String(timeStr || "").split(":").map(Number);
  if (isNaN(h) || isNaN(m) || isNaN(s)) return 0;
  return h * 60 + m + s / 60;
};
const formatMinutesToHHMMSS = (totalMinutes) => {
  if (totalMinutes <= 0) return "00:00:00";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  const seconds = Math.round((totalMinutes % 1) * 60);
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
};
const flattenAttendanceRows = (result, req) => {
  const rows = itemArray(result);
  const dates = attendanceDateRange(req?.body?.selectedDates);
  return rows.map((row) => {
    const flat = { ...row };
    let totalWorkingMinutes = 0;
    for (const date of dates) {
      const key = attendanceDateKey(date);
      const attendance = (row.attendanceData || []).find((a) => a.date === key);
      let cellValue = "-";
      if (attendance) {
        cellValue =
          attendance.status === "L" && attendance.leave_type
            ? `${attendance.status} (${attendance.leave_type})`
            : attendance.status;
        const messages = attendance.messages || [];
        const times = messages
          .filter((m) => m.attendanceDate === key)
          .map((m) => m.attendanceTime);
        if (times.length) {
          const pairs = [];
          for (let i = 0; i < times.length; i += 2) pairs.push(times.slice(i, i + 2).join(" - "));
          cellValue += ` (${pairs.join(", ")})`;
        }
        messages.forEach((m) => {
          if (m.attendanceDate === key && m.total_working_hour) {
            totalWorkingMinutes += parseWorkingHoursToMinutes(m.total_working_hour);
          }
        });
      }
      flat[key] = cellValue;
    }
    flat.total_working_hours = formatMinutesToHHMMSS(Math.round(totalWorkingMinutes * 100) / 100);
    flat.company_paid_leave = row.companyPaidLeave ?? "-";
    flat.employee_paid_leave = row.employeePaidLeave ?? "-";
    flat.paid_days_paid_hours = `${row.totalPaidDays ?? 0}/${row.totalPaidHours ?? "00:00:00"}`;
    flat.salary = row.finalSalary ?? "0";
    return flat;
  });
};

// Product/Category Sales & Purchase family (4 reportTypes): backend
// returns 5 parallel arrays (quotation, salesOrder, salesInvoice,
// purchaseInvoice, purchaseOrder) built from a paginated cart-item query
// - a single product/category's items can land on either side of a page
// boundary. extractRows here only tags+flattens each page's 5 arrays into
// one list (safe to concat across pages, count preserved 1:1 with the
// page's raw cart-item fetch so the "more pages?" check in
// genericReportExportService.js still works); the actual grouping runs
// ONCE via `postProcess` over the complete accumulated set, ported from
// the old client-side pivotData() in each report's *Controller.ts (fixes
// a latent bug: the previous per-page pivot here would have silently
// split one product/category's totals across pages for a large dataset).
const CART_SOURCE_TO_FIELD = {
  quotation: "quotation",
  salesOrder: "salesorder",
  salesInvoice: "salesinvoice",
  purchaseInvoice: "purchaseinvoice",
  purchaseOrder: "purchaseorder",
};
const flattenCartSourcePages = (result) => {
  const data = result?.data || {};
  const rows = [];
  for (const [sourceKey, fieldKey] of Object.entries(CART_SOURCE_TO_FIELD)) {
    for (const item of data[sourceKey] || []) {
      rows.push({ ...item, __field: fieldKey });
    }
  }
  return rows;
};
const groupCartRowsBy = (rows, idKey, nameKey, extraKeys = []) => {
  const grouped = {};
  for (const item of rows) {
    const key = `${item[idKey]}_${item[nameKey]}`;
    if (!grouped[key]) {
      grouped[key] = { [idKey]: item[idKey], [nameKey]: item[nameKey] };
      for (const extraKey of extraKeys) grouped[key][extraKey] = item[extraKey];
    }
    grouped[key][item.__field] = `${item.total_quantity}(${item.total_amount})`;
  }
  return Object.values(grouped);
};

// Pending-quantity derivation (order minus invoice, quantity and amount)
// shared by Category Pending and Product Pending - ported from their
// near-identical parseQuantityAmount/calculatePending in *View.tsx.
const parseQuantityAmount = (value) => {
  if (!value || value === "-") return { quantity: 0, amount: 0 };
  const match = String(value).match(/^(\d+)\(₹?(\d*\.?\d*)\)?$/);
  if (!match) return { quantity: 0, amount: 0 };
  return { quantity: parseInt(match[1], 10) || 0, amount: parseFloat(match[2]) || 0 };
};
const calculatePending = (order, invoice) => {
  const orderValues = parseQuantityAmount(order);
  const invoiceValues = parseQuantityAmount(invoice);
  const pendingQuantity = orderValues.quantity - invoiceValues.quantity;
  const pendingAmount = orderValues.amount - invoiceValues.amount;
  return pendingQuantity >= 0 && pendingAmount >= 0
    ? `${pendingQuantity}(${pendingAmount.toFixed(2)})`
    : "-";
};
// Composite "qty(symbol+amount)" column sum, for the "Total" row Category
// Sales & Purchase and Category Pending append - ported from their
// calculateColumnTotals in *View.tsx.
const sumCompositeColumn = (rows, field) => {
  let quantity = 0;
  let amount = 0;
  let symbol = "";
  for (const item of rows) {
    const value = item[field];
    if (!value) continue;
    const str = String(value);
    const qtyMatch = str.match(/^(\d+)/);
    if (qtyMatch) quantity += parseInt(qtyMatch[1], 10);
    const amtMatch = str.match(/\(([^)]+)\)/);
    if (amtMatch) {
      const raw = amtMatch[1];
      amount += parseFloat(raw.replace(/[^0-9.]/g, "")) || 0;
      const extractedSymbol = raw.replace(/[0-9.,\s]/g, "");
      if (extractedSymbol) symbol = extractedSymbol;
    }
  }
  return quantity > 0 || amount > 0 ? `${quantity}(${symbol}${amount.toFixed(2)})` : "-";
};

const postProcessProductSalesPurchase = (rows) =>
  groupCartRowsBy(rows, "item_product_id", "item_product_name", [
    "item_product_code",
    "item_category_name",
    "item_unit_name",
  ]);

const postProcessCategoryMovement = (rows) => {
  const grouped = groupCartRowsBy(rows, "item_category_id", "item_category_name");
  const fields = ["quotation", "salesorder", "salesinvoice", "purchaseorder", "purchaseinvoice"];
  const totalsRow = { item_category_name: "Total" };
  for (const field of fields) totalsRow[field] = sumCompositeColumn(grouped, field);
  return [...grouped, totalsRow];
};

const postProcessCategoryPending = (rows) => {
  const grouped = groupCartRowsBy(rows, "item_category_id", "item_category_name").map((row) => ({
    ...row,
    pending_sales: calculatePending(row.salesorder, row.salesinvoice),
    pending_purchase: calculatePending(row.purchaseorder, row.purchaseinvoice),
  }));
  const fields = ["salesorder", "salesinvoice", "pending_sales", "purchaseorder", "purchaseinvoice", "pending_purchase"];
  const totalsRow = { item_category_name: "Total" };
  for (const field of fields) totalsRow[field] = sumCompositeColumn(grouped, field);
  return [...grouped, totalsRow];
};

const postProcessProductPending = (rows) =>
  groupCartRowsBy(rows, "item_product_id", "item_product_name", [
    "item_product_code",
    "item_category_name",
  ]).map((row) => ({
    ...row,
    pending_sales: calculatePending(row.salesorder, row.salesinvoice),
    pending_purchase: calculatePending(row.purchaseorder, row.purchaseinvoice),
  }));

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
  // One entry serves every Report Builder report (query/plugin/composite
  // alike) — unlike every other entry here, "report_builder" isn't a
  // per-report reportType, it's one constant every export shares; the
  // actual report_definition_id rides in the filters payload instead
  // (see fetchReportBuilderExportPage's own comment). extractRows reads
  // runDefinitionByType's own {data:{rows,...}} envelope directly.
  report_builder: {
    fetchPage: (req) => fetchReportBuilderExportPage(req),
    extractRows: (result) => result?.data?.rows || [],
  },
  all_contact_report: {
    fetchPage: (req) => getAllContactReport(req),
    extractRows: itemArray,
  },
  all_deleted_contact_report: {
    fetchPage: (req) => getAllContactReport({ ...req, body: { ...req.body, deleted_flag: 1 } }),
    extractRows: (result) => itemArray(result).map(deriveContactDateRow),
  },
  chain_wise_contact_report: {
    fetchPage: (req) => getAllContactChainWise(req),
    extractRows: (result) => itemArray(result).map(deriveContactDateRow),
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
    extractRows: (result) => nestedDataArray(result).map(deriveReminderRow),
    postProcess: appendReminderTotalRow,
  },
  all_inquiry_report: {
    fetchPage: (req) => inquiryReport(req),
    extractRows: (result) => itemsArray(result).map(deriveInquiryRow),
  },

  // Cart family - all backed by getTeamAllCarts, dispatched by `type`
  // (pageIdMap confirmed in teamAllCartsReportServices.js:54-65).
  quotation_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 1 } }),
    extractRows: cartRows(composeCartDisplayFieldsWithPhone),
  },
  sales_order_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 2 } }),
    extractRows: cartRows(composeCartDisplayFieldsWithPhone),
  },
  sales_invoice_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 3 } }),
    extractRows: cartRows(composeCartDisplayFieldsWithPhone),
  },
  purchase_order_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 4 } }),
    extractRows: cartRows(composeCartDisplayFields),
  },
  purchase_invoice_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 5 } }),
    extractRows: cartRows(composeCartDisplayFields, { transactionMode: true }),
  },
  return_sales_invoice_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 6 } }),
    extractRows: cartRows(composeCartDisplayFields, { transactionMode: true }),
  },
  return_purchase_invoice_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 7 } }),
    extractRows: cartRows(composeCartDisplayFields, { transactionMode: true }),
  },
  inward_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 8 } }),
    extractRows: cartRows(composeCartDisplayFields),
  },
  dispatch_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 9 } }),
    extractRows: cartRows(composeCartDisplayFields),
  },
  proforma_invoice_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 12 } }),
    extractRows: cartRows(composeCartDisplayFields),
  },
  // Unreachable in the current UI (ReportsModel.tsx's entry is commented
  // out) - registered anyway since it costs nothing and the view already
  // wires the shared export service directly.
  detailed_order_report: {
    fetchPage: (req) => getTeamAllCarts(req),
    extractRows: cartRows(composeCartDisplayFields),
  },
  pending_order_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 2 } }),
    extractRows: cartRows(flattenCart, { withRate: false }),
  },
  pending_purchase_report: {
    fetchPage: (req) => getTeamAllCarts({ ...req, body: { ...req.body, type: 5 } }),
    extractRows: cartRows(flattenCart, { withRate: false }),
  },

  account_outstanding_report: {
    fetchPage: (req) => getAccountOutstandingReport(req),
    extractRows: flatArray,
  },
  account_credit_report: {
    fetchPage: (req) => getAllAccountTranstionsReport({ ...req, body: { ...req.body, credit_debit_flag: 1 } }),
    extractRows: deriveAccountTxnRows("Credit"),
  },
  account_debit_report: {
    fetchPage: (req) => getAllAccountTranstionsReport({ ...req, body: { ...req.body, credit_debit_flag: 2 } }),
    extractRows: deriveAccountTxnRows("Debit"),
  },
  all_account_report: {
    fetchPage: (req) => getAllAccountTranstionsReport(req),
    extractRows: deriveAccountTxnRows(null),
  },
  employee_account_outstanding_report: {
    fetchPage: (req) => getEmployeeAccountOutstandingReport(req),
    extractRows: flatArray,
  },
  employee_account_transaction_report: {
    fetchPage: (req) => getEmployeeAccountTranctionReport(req),
    extractRows: (result) => nestedDataArray(result).map(deriveEmployeeTxnRow),
  },
  expense_detailed_report: {
    fetchPage: (req) => detailedExpenseGet(req),
    extractRows: (result) => itemArray(result).map(deriveExpenseRow),
  },
  team_day_wise_expense_report: {
    fetchPage: (req) => teamDayExpense(req),
    extractRows: teamDayExpenseRows,
  },
  salary_register_report: {
    fetchPage: (req) => salaryRegistrationGet(req),
    extractRows: (result) => itemArray(result).map(deriveSalaryRow),
  },

  label_wise_report: {
    fetchPage: (req) => lableReport(req),
    extractRows: itemArray,
  },
  product_inventory_report: {
    fetchPage: (req) => productInventoryReport(req),
    extractRows: (result) =>
      itemsArray(result).map((raw) => {
        const row = toPlain(raw);
        return { ...row, name: `${row.name ?? "-"}${row.code ? ` - ${row.code}` : ""}` };
      }),
  },
  product_sales_purchase_report: {
    fetchPage: (req) => getProductSalesPurchase(req),
    extractRows: flattenCartSourcePages,
    postProcess: (rows) => postProcessProductSalesPurchase(rows).map(withProductCode),
  },
  product_pending_report: {
    fetchPage: (req) => getProductSalesPurchase(req),
    extractRows: flattenCartSourcePages,
    postProcess: (rows) => postProcessProductPending(rows).map(withProductCode),
  },
  category_sales_purchase_report: {
    fetchPage: (req) => getCategorySalesPurchase(req),
    extractRows: flattenCartSourcePages,
    postProcess: postProcessCategoryMovement,
  },
  category_pending_report: {
    fetchPage: (req) => getCategorySalesPurchase(req),
    extractRows: flattenCartSourcePages,
    postProcess: postProcessCategoryPending,
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
    extractRows: (result) => itemArray(result).map(deriveTargetIncentiveRow),
  },
  team_pending_work_report: {
    fetchPage: (req) => getTeamPendingWorkReport(req),
    extractRows: (result) => itemArray(result).map(deriveTeamPendingRow),
  },
  process_attendance_report: {
    fetchPage: (req) => processAttendanceGet(req),
    extractRows: (result) => itemArray(result).map(deriveProcessAttendanceRow),
  },

  team_performance_report: {
    fetchPage: (req) => getTeamPerformanceReport(req),
    extractRows: (result) => itemArray(result).map(deriveTeamPerformanceRow),
  },
  attendance_report: {
    fetchPage: (req) => getTeamAttendanceReport(req),
    extractRows: flattenAttendanceRows,
  },
  all_task_report: {
    fetchPage: (req) => getTeamTaskReport(req),
    extractRows: (result) => nestedDataArray(result).map(deriveTaskRow),
  },
  customer_sales_purchase_report: {
    fetchPage: (req) => getCustomerSalesPurchaseReport(req),
    extractRows: customerSalesPurchaseRows,
  },
};
