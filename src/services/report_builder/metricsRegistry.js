// Whitelist for composite ("metrics per team member") report definitions —
// each metric is one pre-authored aggregate against an ALREADY-REGISTERED
// modelRegistry.js table, never user-authored. Server-side config only, not
// derived from report_definitions input, so it doesn't need the same
// column-whitelist-injection defense query-type columns need — a developer
// reviewed this list, a user only ever picks keys from it.
export const METRICS_REGISTRY = {
  contactCount: { label: "Contacts Created", modelKey: "contacts", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id" },
  taskCount: { label: "Tasks Assigned", modelKey: "task_managements", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id" },
  cartCount: { label: "Orders Created", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id" },
  cartTotal: { label: "Order Total", modelKey: "carts", dimensionColumn: "a_application_login_id", aggregate: "sum", column: "grand_total" },
  visitCount: { label: "Visits", modelKey: "visits", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id" },
  expenseTotal: { label: "Expense Total", modelKey: "expenses", dimensionColumn: "a_application_login_id", aggregate: "sum", column: "amount" },
  inquiryCount: { label: "Inquiries", modelKey: "inquiries", dimensionColumn: "a_application_login_id", aggregate: "count", column: "id" },
};

export const getRegisteredMetric = (key) => METRICS_REGISTRY[key];

export const listMetricsRegistry = () => Object.entries(METRICS_REGISTRY).map(([key, m]) => ({ key, label: m.label }));
