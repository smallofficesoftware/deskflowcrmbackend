// Shared constants for the Automations module.
// Plan: plans/2026-09-26-automations-plan.txt (sections 3, 4, 13).

/** Tenant table -> automation record type. */
export const TABLE_TO_RECORD_TYPE = {
  contact_masters: "contact",
  inquiries: "inquiry",
  carts: "cart",
  task_managements: "task",
  account_transactions: "payment",
  call_histories: "call",
  reminder_messages: "reminder",
  form_builder_submissions: "form",
  contact_message_histories: "whatsapp",
};

export const RECORD_TYPE_TO_TABLE = Object.fromEntries(
  Object.entries(TABLE_TO_RECORD_TYPE).map(([t, r]) => [r, t])
);

/** Column that holds "assigned to" per record type (for *.assigned triggers). */
export const ASSIGN_FIELD = {
  contact: "assinged_to_work_a_application_id",
  inquiry: "inquiry_assigned_team_member",
  task: "assigned_team_member",
};

/** Column that holds the label per record type (for contact.label). */
export const LABEL_FIELD = {
  contact: "lable",
};

/** Column that holds status per record type. */
export const STATUS_FIELD = {
  contact: "contact_status",
  inquiry: "contact_status",
  cart: "cart_status",
  task: "status",
};

/** carts.type values (utils/AppEnumeration.js STOCK_IN_OUT_ACCESSIBILITY). */
export const CART_TYPES = {
  1: "Quotation",
  2: "Sales order",
  3: "Sales invoice",
  4: "Purchase invoice",
  5: "Purchase order",
  6: "Return sales invoice",
  7: "Return purchase invoice",
  8: "Inward",
  9: "Dispatch",
  10: "Stock inward",
  11: "Stock outward",
  12: "Proforma invoice",
};

/**
 * Trigger catalog. `event` triggers are fired by emitAutomationEvent();
 * `cron` triggers are found by scheduler.js; `webhook` / `manual` by their
 * own entry points. `phase` marks what P1 ships (13 / section 9).
 */
export const TRIGGERS = {
  "contact.created":        { group: "Contact", label: "Contact created", source: "event", record: "contact", phase: 1 },
  "contact.updated":        { group: "Contact", label: "Contact updated", source: "event", record: "contact", phase: 1 },
  "contact.status_changed": { group: "Contact", label: "Contact status changed", source: "event", record: "contact", phase: 1 },
  "contact.assigned":       { group: "Contact", label: "Contact assigned / reassigned", source: "event", record: "contact", phase: 1 },
  "contact.label":          { group: "Contact", label: "Label changed", source: "event", record: "contact", phase: 1 },
  "contact.special_date":   { group: "Contact", label: "Birthday / anniversary / date field", source: "cron", record: "contact", phase: 1 },
  "contact.inactive":       { group: "Contact", label: "Inactive contact (no order / inquiry in X days)", source: "cron", record: "contact", phase: 1 },

  "inquiry.created":        { group: "Inquiry", label: "Inquiry created", source: "event", record: "inquiry", phase: 1 },
  "inquiry.updated":        { group: "Inquiry", label: "Inquiry updated", source: "event", record: "inquiry", phase: 1 },
  "inquiry.status_changed": { group: "Inquiry", label: "Inquiry stage / status changed", source: "event", record: "inquiry", phase: 1 },
  "inquiry.assigned":       { group: "Inquiry", label: "Inquiry assigned / reassigned", source: "event", record: "inquiry", phase: 1 },
  "inquiry.followup_due":   { group: "Inquiry", label: "Follow-up date reached", source: "cron", record: "inquiry", phase: 2 }, // inquiries have no follow-up date column; reminders reference chat messages, not inquiries

  "cart.created":           { group: "Sales & purchase", label: "Document created", source: "event", record: "cart", phase: 1 },
  "cart.updated":           { group: "Sales & purchase", label: "Document updated", source: "event", record: "cart", phase: 1 },
  "cart.status_changed":    { group: "Sales & purchase", label: "Document status changed", source: "event", record: "cart", phase: 1 },
  "cart.deleted":           { group: "Sales & purchase", label: "Document cancelled / deleted", source: "event", record: "cart", phase: 1 },
  "cart.not_converted":     { group: "Sales & purchase", label: "Quotation not converted in X days", source: "cron", record: "cart", phase: 1 },
  "cart.due":               { group: "Sales & purchase", label: "Invoice due / overdue", source: "cron", record: "cart", phase: 1 },

  "payment.created":        { group: "Accounts", label: "Payment received", source: "event", record: "payment", phase: 1 },
  "payment.overdue":        { group: "Accounts", label: "Outstanding overdue X days", source: "cron", record: "contact", phase: 1 },

  "task.created":           { group: "Task / ticket", label: "Task / ticket created", source: "event", record: "task", phase: 1 },
  "task.updated":           { group: "Task / ticket", label: "Task / ticket updated", source: "event", record: "task", phase: 1 },
  "task.status_changed":    { group: "Task / ticket", label: "Task / ticket status changed", source: "event", record: "task", phase: 1 },
  "task.assigned":          { group: "Task / ticket", label: "Task / ticket assigned", source: "event", record: "task", phase: 1 },
  "task.overdue":           { group: "Task / ticket", label: "Task due / overdue", source: "cron", record: "task", phase: 1 },

  "call.created":           { group: "Calls", label: "Call logged", source: "event", record: "call", phase: 1 },
  "whatsapp.received":      { group: "WhatsApp", label: "WhatsApp message received", source: "event", record: "whatsapp", phase: 1 },
  "form.submitted":         { group: "Forms", label: "Form submitted", source: "event", record: "form", phase: 1 },
  "form.status_changed":    { group: "Forms", label: "Form submission status changed", source: "event", record: "form", phase: 2 },
  "website.contact_us":     { group: "Website", label: "Website contact us (Deskflow only)", source: "event", record: "website", phase: 1 },
  "website.book_demo":      { group: "Website", label: "Website book demo (Deskflow only)", source: "event", record: "website", phase: 1 },
  "reminder.due":           { group: "Reminders", label: "Reminder due", source: "cron", record: "reminder", phase: 1 },

  "schedule":               { group: "Time", label: "Schedule", source: "cron", record: null, phase: 1 },
  "date_field":             { group: "Time", label: "Date field based", source: "cron", record: null, phase: 1 },
  "webhook.received":       { group: "Webhook", label: "Incoming webhook call", source: "webhook", record: null, phase: 1 },
  "manual":                 { group: "Other", label: "Manual run", source: "manual", record: null, phase: 1 },
};

export const IMPORT_ORIGINS = ["import"];
export const MAX_CHAIN_DEPTH = 3;
export const MAX_NODES_PER_RUN = 200;
export const AUTO_PAUSE_AFTER_FAILURES = 10;
export const LOG_RETENTION_DAYS = 90;
export const DEFAULT_TIMEZONE = "+05:30";
export const THIRD_PARTY_LOG_INTEGRATION = "AUTOMATION";

/**
 * Plan limits come from plan_vs_pages.data_limit of the existing "Workflow Automation" page
 * (same mechanism as the contact limit) - see planLimit.js. Runs per month = data_limit x this.
 */
export const PLAN_PAGE_SLUG = "workflow_automations";
export const RUNS_PER_ACTIVE_FLOW = 400;

/** Used only when the company has no plan record at all (trial / legacy) - a safety net. */
export const DEFAULT_PLAN_LIMITS = { max_active_flows: 5, max_runs_per_month: 2000 };
