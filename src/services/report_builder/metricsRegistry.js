// Whitelist for composite ("metrics per team member") report definitions —
// each metric is one pre-authored aggregate against an ALREADY-REGISTERED
// modelRegistry.js table, never user-authored. Server-side config only, not
// derived from report_definitions input, so it doesn't need the same
// column-whitelist-injection defense query-type columns need — a developer
// reviewed this list, a user only ever picks keys from it.
//
// `filter: {column, value}` (optional) — a fixed equality condition applied
// to that metric's own query (e.g. carts.type = 1 for "Quotations only").
// Same reasoning as everything else here: server-authored, not user input.
export const METRICS_REGISTRY = {
  contactCount: { label: "Contacts Created", modelKey: "contacts", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id" },
  taskCount: { label: "Tasks Assigned", modelKey: "task_managements", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id" },
  cartCount: { label: "Orders Created", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id" },
  cartTotal: { label: "Order Total", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "sum", column: "grand_total" },
  visitCount: { label: "Visits", modelKey: "visits", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id" },
  expenseTotal: { label: "Expense Total", modelKey: "expenses", dimensionColumn: "a_application_login_id", aggregate: "sum", column: "amount" },
  inquiryCount: { label: "Inquiries", modelKey: "inquiries", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id" },

  // Cart-type breakdown (type: 1=quotation, 2=salesOrder, 3=salesInvoice,
  // 4=purchaseInvoice, 5=purchaseOrder — confirmed against orderServices.js's
  // own PDFME_DOC_TYPE_BY_CART_TYPE mapping) — covers
  // teamAllCartsReportServices' per-type split.
  quotationCount: { label: "Quotations", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id", filter: { column: "type", value: 1 } },
  quotationTotal: { label: "Quotation Total", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "sum", column: "grand_total", filter: { column: "type", value: 1 } },
  salesOrderCount: { label: "Sales Orders", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id", filter: { column: "type", value: 2 } },
  salesOrderTotal: { label: "Sales Order Total", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "sum", column: "grand_total", filter: { column: "type", value: 2 } },
  salesInvoiceCount: { label: "Sales Invoices", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id", filter: { column: "type", value: 3 } },
  salesInvoiceTotal: { label: "Sales Invoice Total", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "sum", column: "grand_total", filter: { column: "type", value: 3 } },
  purchaseInvoiceCount: { label: "Purchase Invoices", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id", filter: { column: "type", value: 4 } },
  purchaseInvoiceTotal: { label: "Purchase Invoice Total", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "sum", column: "grand_total", filter: { column: "type", value: 4 } },

  // Attendance (attendance_status: 1=check-in, 2=check-out — confirmed in
  // attendanceServices.js, these are punch events, not a daily present/
  // absent flag). checkInCount ≈ days present, one check-in per work day.
  checkInCount: { label: "Check-ins (Present Days)", modelKey: "attendance", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id", filter: { column: "attendance_status", value: 1 } },

  // Alternate attendance granularity reusing salary_registers' own already-
  // computed monthly figures instead of re-deriving from raw punch events —
  // covers teamAttendanceReportServices/processAttendanceReportServices'
  // "days present/absent/leave this period" need without a second attendance
  // data path. dimensionColumn here is employee_id, not a_application_login_id
  // (salary_registers' own FK name — confirmed in salaryRegisterModel.js).
  presentDaysFromSalary: { label: "Present Days (Salary Register)", modelKey: "salary_registers", dimensionColumn: "employee_id", aggregate: "sum", column: "total_present_day" },
  absentDaysFromSalary: { label: "Absent Days (Salary Register)", modelKey: "salary_registers", dimensionColumn: "employee_id", aggregate: "sum", column: "total_absent" },
  leaveDaysFromSalary: { label: "Leave Days (Salary Register)", modelKey: "salary_registers", dimensionColumn: "employee_id", aggregate: "sum", column: "total_leave" },
};

export const getRegisteredMetric = (key) => METRICS_REGISTRY[key];

export const listMetricsRegistry = () => Object.entries(METRICS_REGISTRY).map(([key, m]) => ({ key, label: m.label }));
