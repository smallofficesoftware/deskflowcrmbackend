import { CART_TYPES, TRIGGERS } from "./constants.js";
import { OPERATOR_NAMES } from "./conditions.js";
import { NODE_TYPES } from "./nodes/index.js";

// Metadata the builder UI renders forms from, and the save/activate
// validation reads. Field types the UI must support:
//   text | textarea | number | boolean | select | multiselect
//   template     text that accepts {{ variables }}
//   user | users team member picker(s) (+ special values, see `special`)
//   ref          master-data picker, `ref` names the list
//                (source_types, labels, stages, task_categories, products, categories, whatsapp_templates)
//   keyvalue     [{ key, value }]      fields   [{ field, value }]
//   rules        [{ field, operator, value }]  + sibling "match" AND / OR
//   conditions   [{ id, sourceHandle, rules, match }]  (Condition step)
//   datetime     date-time or {{ variable }}

const F = (key, label, type, extra = {}) => ({ key, label, type, ...extra });
const RECIPIENT = [
  { value: "contact", label: "The contact" },
  { value: "assigned_user", label: "Assigned team member" },
  { value: "manager", label: "Assigned member's manager" },
  { value: "run_as", label: "Automation's Run-as user" },
  { value: "custom", label: "Custom" },
];
const SENDER = [
  { value: "run_as", label: "Automation's Run-as user" },
  { value: "assigned_user", label: "Assigned team member" },
];
const ASSIGN_MODE = [
  { value: "user", label: "One team member" },
  { value: "round_robin", label: "Take turns (round robin)" },
  { value: "least_load", label: "Least busy (last 30 days)" },
];
const assignFields = () => [
  F("mode", "Assign to", "select", { options: ASSIGN_MODE, default: "user" }),
  F("user_id", "Team member", "user", { showIf: { mode: "user" }, required: true }),
  F("user_ids", "Team members", "users", { showIf: { mode: ["round_robin", "least_load"] }, required: true }),
];
const cartTypeOptions = Object.entries(CART_TYPES).map(([value, label]) => ({ value: Number(value), label }));
const WHEN = [
  { value: "before", label: "Days before" },
  { value: "on", label: "On the day" },
  { value: "after", label: "Days after" },
];
const commonFilter = [F("rules", "Only when", "rules"), F("match", "Match", "select", { options: ["AND", "OR"], default: "AND" })];

export const TRIGGER_CONFIG = {
  "contact.created": [F("source_type_ids", "Only these sources", "ref", { ref: "source_types", multiple: true })],
  "contact.updated": [F("fields", "Only when these fields change", "multiselect", { ref: "contact_fields" })],
  "contact.status_changed": [F("status_from", "From", "ref", { ref: "stages", multiple: true }), F("status_to", "To", "ref", { ref: "stages", multiple: true })],
  "inquiry.created": [F("source_type_ids", "Only these sources", "ref", { ref: "source_types", multiple: true })],
  "inquiry.status_changed": [F("status_from", "From", "ref", { ref: "stages", multiple: true }), F("status_to", "To", "ref", { ref: "stages", multiple: true })],
  "cart.created": [F("cart_types", "Document types", "multiselect", { options: cartTypeOptions })],
  "cart.updated": [F("cart_types", "Document types", "multiselect", { options: cartTypeOptions })],
  "cart.status_changed": [
    F("cart_types", "Document types", "multiselect", { options: cartTypeOptions }),
    F("status_from", "From", "text"),
    F("status_to", "To", "text"),
  ],
  "cart.deleted": [F("cart_types", "Document types", "multiselect", { options: cartTypeOptions })],
  "cart.not_converted": [F("days", "Not converted after (days)", "number", { default: 3 }), F("cart_types", "Document types", "multiselect", { options: cartTypeOptions, default: [1] })],
  "cart.due": [
    F("cart_types", "Document types", "multiselect", { options: cartTypeOptions, default: [3] }),
    F("when", "When", "select", { options: WHEN, default: "after" }),
    F("days", "Days", "number", { default: 0 }),
    F("time", "At time", "text", { placeholder: "09:30" }),
  ],
  "payment.overdue": [
    F("min_amount", "Outstanding at least", "number", { default: 1 }),
    F("days_without_payment", "No payment received for (days)", "number", { default: 15 }),
    F("repeat_days", "Repeat every (days)", "number"),
  ],
  "task.created": [F("task_kind", "Applies to", "select", { options: [{ value: "any", label: "Tasks and tickets" }, { value: "task", label: "Tasks only" }, { value: "ticket", label: "Tickets only" }], default: "any" })],
  "task.overdue": [
    F("hours_overdue", "Overdue by (hours)", "number", { default: 0 }),
    F("task_kind", "Applies to", "select", { options: [{ value: "any", label: "Tasks and tickets" }, { value: "task", label: "Tasks only" }, { value: "ticket", label: "Tickets only" }], default: "any" }),
  ],
  "contact.special_date": [F("field", "Date field", "ref", { ref: "contact_date_fields", required: true }), F("time", "At time", "text", { placeholder: "09:00" })],
  "contact.inactive": [
    F("days", "Inactive for (days)", "number", { default: 30 }),
    F("require_no", "No recent", "multiselect", { options: [{ value: "order", label: "Order / invoice" }, { value: "inquiry", label: "Inquiry" }], default: ["order", "inquiry"] }),
    F("repeat_days", "Repeat every (days)", "number"),
  ],
  "call.created": [
    F("max_age_hours", "Ignore calls older than (hours)", "number", { default: 24, help: "The phone uploads its whole call log when it syncs" }),
  ],
  "whatsapp.received": [
    F("keyword_mode", "Message", "select", { options: [{ value: "any", label: "Any message" }, { value: "exact", label: "Is exactly" }, { value: "contains", label: "Contains" }, { value: "starts_with", label: "Starts with" }], default: "any" }),
    F("keywords", "Keywords (comma separated)", "text", { showIf: { keyword_mode: ["exact", "contains", "starts_with"] } }),
  ],
  schedule: [
    F("frequency", "Repeat", "select", { options: [{ value: "minutes", label: "Every X minutes" }, { value: "hourly", label: "Every X hours" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }], default: "daily" }),
    F("every", "Every", "number", { showIf: { frequency: ["minutes", "hourly"] }, default: 1 }),
    F("time", "At time", "text", { showIf: { frequency: ["daily", "weekly", "monthly"] }, placeholder: "09:00" }),
    F("weekday", "Weekday (1 = Mon)", "number", { showIf: { frequency: "weekly" } }),
    F("day_of_month", "Day of month", "number", { showIf: { frequency: "monthly" } }),
    F("record_type", "Run once for each matching", "select", { options: [{ value: "", label: "Just run once" }, { value: "contact", label: "Contact" }, { value: "inquiry", label: "Inquiry" }, { value: "cart", label: "Document" }, { value: "task", label: "Task / ticket" }] }),
  ],
  date_field: [
    F("record_type", "Record", "select", { required: true, options: [{ value: "contact", label: "Contact" }, { value: "inquiry", label: "Inquiry" }, { value: "cart", label: "Document" }, { value: "task", label: "Task / ticket" }] }),
    F("field", "Date field", "text", { required: true }),
    F("when", "When", "select", { options: WHEN, default: "on" }),
    F("days", "Days", "number", { default: 0 }),
    F("time", "At time", "text", { placeholder: "09:00" }),
  ],
  "webhook.received": [],
  manual: [F("record_type", "Run from", "select", { options: [{ value: "contact", label: "Contact" }, { value: "inquiry", label: "Inquiry" }, { value: "cart", label: "Document" }, { value: "task", label: "Task / ticket" }] })],
};

const TRIGGER_COMMON = [
  ...commonFilter,
  F("run_once", "Run only once per record", "boolean"),
  F("business_hours_only", "Only in business hours (else wait)", "boolean"),
];
const CRON_COMMON = [
  F("lookback_days", "Only look back (days)", "number", { default: 2, help: "Stops old records firing when the automation is first switched on" }),
  F("max_per_day", "Max runs per day", "number", { default: 200 }),
];

export const NODE_DEFS = {
  trigger: { group: "Start", label: "Trigger", fields: [] },

  send_whatsapp: {
    group: "Messages", label: "Send WhatsApp", outputs: ["sent", "sent_to", "mode"],
    fields: [
      F("mode", "Type", "select", { options: [{ value: "text", label: "Text" }, { value: "template", label: "Template" }, { value: "media", label: "Image / document / video" }], default: "text" }),
      F("to", "To", "select", { options: RECIPIENT, default: "contact" }),
      F("number", "Mobile number", "template", { showIf: { to: "custom" } }),
      F("message", "Message", "template", { required: true }),
      F("template_id", "Template", "ref", { ref: "whatsapp_templates", showIf: { mode: "template" } }),
      F("media_url", "File link", "template", { showIf: { mode: "media" }, required: true }),
      F("media_type", "File type", "select", { options: ["image", "document", "video"], showIf: { mode: "media" }, default: "document" }),
      F("file_name", "File name", "template", { showIf: { mode: "media" } }),
      F("sender", "Send from", "select", { options: SENDER, default: "run_as" }),
    ],
  },
  send_email: {
    group: "Messages", label: "Send email", outputs: ["sent", "sent_to", "message_id"],
    fields: [
      F("to", "To", "select", { options: RECIPIENT, default: "contact" }),
      F("email", "Email address", "template", { showIf: { to: "custom" } }),
      F("cc", "CC", "template"),
      F("subject", "Subject", "template", { required: true }),
      F("body", "Body", "textarea", { required: true, template: true }),
      F("sender", "Send from", "select", { options: SENDER, default: "run_as" }),
    ],
  },
  send_document: {
    group: "Messages", label: "Send document PDF", outputs: ["sent", "cart_id", "channel"],
    fields: [
      F("cart_id", "Document (blank = the trigger's document)", "template"),
      F("channel", "Send by", "select", { options: [{ value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }], default: "whatsapp" }),
      F("to", "Email to", "select", { options: RECIPIENT, default: "contact", showIf: { channel: "email" } }),
      F("subject", "Subject", "template", { showIf: { channel: "email" } }),
      F("body", "Body", "textarea", { showIf: { channel: "email" }, template: true }),
      F("sender", "Send from", "select", { options: SENDER, default: "run_as" }),
    ],
  },
  notify: {
    group: "Messages", label: "In-app notification", outputs: ["notified", "title"],
    fields: [F("users", "Notify", "users", { required: true, special: ["assigned_user", "run_as"] }), F("title", "Title", "template"), F("body", "Message", "template")],
  },
  notify_manager: {
    group: "Messages", label: "Notify manager (escalate)", outputs: ["manager_id"],
    fields: [F("title", "Title", "template"), F("body", "Message", "template", { required: true }), F("also_whatsapp", "Also WhatsApp", "boolean"), F("also_email", "Also email", "boolean")],
  },

  create_contact: {
    group: "Contact", label: "Create contact", outputs: ["contact_id", "existing", "contact"],
    fields: [F("fields", "Fields", "fields", { ref: "contact_fields", required: true }), F("on_duplicate", "If the mobile number exists", "select", { options: [{ value: "use_existing", label: "Use the existing contact" }, { value: "create", label: "Create another" }], default: "use_existing" })],
  },
  update_contact: {
    group: "Contact", label: "Update contact", outputs: ["contact_id", "updated"],
    fields: [F("contact_id", "Contact (blank = current)", "template"), F("fields", "Fields", "fields", { ref: "contact_fields", required: true })],
  },
  change_contact_status: {
    group: "Contact", label: "Change contact status", outputs: ["id", "from", "to"],
    fields: [F("contact_id", "Contact (blank = current)", "template"), F("status_id", "New status", "ref", { ref: "stages", required: true })],
  },
  assign_contact: {
    group: "Contact", label: "Assign contact", outputs: ["contact_id", "assigned_user_id", "assigned_user_name"],
    fields: [F("contact_id", "Contact (blank = current)", "template"), ...assignFields()],
  },
  contact_label: {
    group: "Contact", label: "Add / remove label", outputs: ["contact_id", "labels"],
    fields: [F("contact_id", "Contact (blank = current)", "template"), F("action", "Action", "select", { options: [{ value: "add", label: "Add" }, { value: "remove", label: "Remove" }, { value: "set", label: "Replace all" }], default: "add" }), F("label_ids", "Labels", "ref", { ref: "labels", multiple: true, required: true })],
  },

  create_inquiry: {
    group: "Inquiry", label: "Create inquiry", outputs: ["inquiry_id", "inquiry"],
    fields: [
      F("contact_id", "Contact (blank = current)", "template"),
      F("description", "Description", "template"),
      F("product_id", "Product", "ref", { ref: "products" }),
      F("category_id", "Category", "ref", { ref: "categories" }),
      F("qty", "Quantity", "template"),
      F("source_type_id", "Source", "ref", { ref: "source_types" }),
      F("assigned_user_id", "Assign to", "user"),
      F("status_id", "Stage", "ref", { ref: "stages" }),
    ],
  },
  update_inquiry: {
    group: "Inquiry", label: "Update inquiry", outputs: ["inquiry_id", "updated"],
    fields: [F("inquiry_id", "Inquiry (blank = current)", "template"), F("fields", "Fields", "fields", { ref: "inquiry_fields", required: true })],
  },
  assign_inquiry: {
    group: "Inquiry", label: "Assign inquiry", outputs: ["inquiry_id", "assigned_user_id", "assigned_user_name"],
    fields: [F("inquiry_id", "Inquiry (blank = current)", "template"), ...assignFields()],
  },
  change_inquiry_status: {
    group: "Inquiry", label: "Change inquiry stage (won / lost ...)", outputs: ["id", "from", "to", "reason"],
    fields: [F("inquiry_id", "Inquiry (blank = current)", "template"), F("status_id", "New stage", "ref", { ref: "stages", required: true }), F("reason", "Reason", "template")],
  },

  convert_document: {
    group: "Documents", label: "Create document from another", outputs: ["cart_id", "from_cart_id", "to_type"],
    fields: [F("cart_id", "From document (blank = current)", "template"), F("to_type", "Create", "select", { options: cartTypeOptions, required: true }), F("mode", "How", "select", { options: [{ value: "convert", label: "Convert" }, { value: "copy", label: "Make a copy" }], default: "convert" })],
  },
  change_document_status: {
    group: "Documents", label: "Change document status", outputs: ["id", "from", "to"],
    fields: [F("cart_id", "Document (blank = current)", "template"), F("status_id", "New status", "text", { required: true })],
  },

  create_task: {
    group: "Tasks", label: "Create task / ticket", outputs: ["task_id", "task_ids"],
    fields: [
      F("title", "Title", "template", { required: true }),
      F("remark", "Details", "template"),
      F("assigned_user_ids", "For", "users", { required: true, special: ["assigned_user"] }),
      F("one_task_per_member", "Separate task for each person", "boolean"),
      F("priority", "Priority", "select", { options: [{ value: 1, label: "Low" }, { value: 2, label: "Medium" }, { value: 3, label: "High" }, { value: 4, label: "Critical" }], default: 2 }),
      F("start_in_minutes", "Starts in (minutes)", "number", { default: 0 }),
      F("due_in_hours", "Due in (hours)", "number", { default: 24 }),
      F("category_id", "Category", "ref", { ref: "task_categories" }),
      F("link_contact", "Link to the contact", "boolean", { default: true }),
      F("is_support_ticket", "Create as support ticket", "boolean"),
    ],
  },
  update_task: {
    group: "Tasks", label: "Update task", outputs: ["task_id", "updated", "status"],
    fields: [F("task_id", "Task (blank = current)", "template"), F("fields", "Fields", "fields", { ref: "task_fields" }), F("status_id", "New status", "text")],
  },
  assign_task: {
    group: "Tasks", label: "Assign task", outputs: ["task_id", "assigned_user_id", "assigned_user_name"],
    fields: [F("task_id", "Task (blank = current)", "template"), ...assignFields()],
  },
  task_comment: {
    group: "Tasks", label: "Add task comment", outputs: ["task_id", "comment_id"],
    fields: [F("task_id", "Task (blank = current)", "template"), F("comment", "Comment", "template", { required: true })],
  },

  create_reminder: {
    group: "Follow-up", label: "Create reminder", outputs: ["reminder_id", "reminder_at"],
    fields: [
      F("contact_id", "Contact (blank = current)", "template"),
      F("remark", "Reminder text", "template", { required: true }),
      F("in_amount", "Remind in", "number", { default: 1 }),
      F("in_unit", "Unit", "select", { options: ["minutes", "hours", "days"], default: "days" }),
      F("at", "Or at exact date-time", "datetime"),
      F("assigned_to", "Remind", "user", { special: ["assigned_user"] }),
    ],
  },
  log_note: {
    group: "Follow-up", label: "Add note to contact timeline", outputs: ["note_id", "contact_id"],
    fields: [F("contact_id", "Contact (blank = current)", "template"), F("note", "Note", "template", { required: true })],
  },

  condition: {
    group: "Logic", label: "Condition (many branches)", wires: "per condition + no_match",
    fields: [F("conditions", "Branches", "conditions", { required: true }), F("no_match_handle", "Otherwise wire", "text", { default: "no_match" })],
  },
  if_else: {
    group: "Logic", label: "If / else", wires: ["if-true", "if-false"],
    fields: [F("rules", "Rules", "rules", { required: true }), F("match", "Match", "select", { options: ["AND", "OR"], default: "AND" })],
  },
  wait: {
    group: "Logic", label: "Wait", outputs: ["resume_at"],
    fields: [F("amount", "Wait for", "number", { required: true }), F("unit", "Unit", "select", { options: ["minutes", "hours", "days", "weeks"], default: "hours" })],
  },
  wait_until: {
    group: "Logic", label: "Wait until", outputs: ["resume_at"],
    fields: [
      F("mode", "Wait until", "select", { options: [{ value: "business_hours", label: "Business hours start" }, { value: "datetime", label: "A date-time" }, { value: "date_field", label: "A date from the record" }], default: "business_hours" }),
      F("at", "Date-time", "datetime", { showIf: { mode: "datetime" } }),
      F("field", "Variable (e.g. record.due_date)", "text", { showIf: { mode: "date_field" } }),
      F("offset_days", "Days before (-) / after (+)", "number", { showIf: { mode: "date_field" } }),
      F("time", "At time", "text", { showIf: { mode: ["datetime", "date_field"] }, placeholder: "09:00" }),
    ],
  },
  stop: { group: "Logic", label: "Stop", fields: [F("reason", "Reason", "text")] },
  set_variable: {
    group: "Data", label: "Set variable", outputs: ["<name>"],
    fields: [F("variables", "Variables", "keyvalue", { keyLabel: "Name", valueLabel: "Value", required: true })],
  },

  http_request: {
    group: "Integrations", label: "Webhook call / HTTP request", outputs: ["status", "ok", "response", "error"], wires: ["src", "failed"],
    fields: [
      F("method", "Method", "select", { options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "POST" }),
      F("url", "URL", "template", { required: true }),
      F("query", "Query parameters", "keyvalue"),
      F("headers", "Headers", "keyvalue"),
      F("body_type", "Body", "select", { options: [{ value: "json", label: "JSON" }, { value: "form", label: "Form" }, { value: "raw", label: "Raw text" }], default: "json" }),
      F("body", "Body content", "textarea", { template: true }),
      F("auth", "Authentication", "select", { options: [{ value: "none", label: "None" }, { value: "bearer", label: "Bearer token" }, { value: "basic", label: "Basic" }, { value: "api_key", label: "API key header" }, { value: "hmac", label: "HMAC signature" }], default: "none" }),
      F("auth_token", "Token", "template", { showIf: { auth: "bearer" } }),
      F("auth_user", "User", "template", { showIf: { auth: "basic" } }),
      F("auth_password", "Password", "template", { showIf: { auth: "basic" }, secret: true }),
      F("api_key_name", "Header name", "text", { showIf: { auth: "api_key" } }),
      F("api_key_value", "Header value", "template", { showIf: { auth: "api_key" }, secret: true }),
      F("hmac_secret", "Secret", "template", { showIf: { auth: "hmac" }, secret: true }),
      F("hmac_header", "Signature header", "text", { showIf: { auth: "hmac" }, default: "X-Signature" }),
      F("timeout_seconds", "Timeout (seconds)", "number", { default: 15 }),
      F("retries", "Retries (0-3)", "number", { default: 0 }),
      F("response_mapping", "Save response values", "keyvalue", { keyLabel: "Response path", valueLabel: "Variable name", mapping: true }),
    ],
  },
  webhook_response: {
    group: "Integrations", label: "Webhook response", outputs: ["status", "body"],
    fields: [F("status_code", "Status code", "number", { default: 200 }), F("body", "Response body (JSON)", "textarea", { template: true })],
  },
};

const NODE_GROUP_ORDER = ["Messages", "Contact", "Inquiry", "Documents", "Tasks", "Follow-up", "Logic", "Data", "Integrations"];

export const buildCatalog = () => ({
  triggers: Object.entries(TRIGGERS).map(([type, t]) => ({
    type,
    ...t,
    config: [...(TRIGGER_CONFIG[type] || []), ...(t.source === "cron" ? CRON_COMMON : []), ...(t.source === "event" ? TRIGGER_COMMON : [])],
  })),
  nodes: Object.entries(NODE_DEFS)
    .filter(([type]) => type !== "trigger")
    .map(([type, def]) => ({ type, ...def }))
    .sort((a, b) => NODE_GROUP_ORDER.indexOf(a.group) - NODE_GROUP_ORDER.indexOf(b.group)),
  operators: OPERATOR_NAMES,
  cart_types: cartTypeOptions,
  wires: { default: "src", error: "on_error" },
});

/** Node types that exist in the catalog but have no handler (must stay empty). */
export const catalogGaps = () => Object.keys(NODE_DEFS).filter((t) => !NODE_TYPES.includes(t));
export const handlerGaps = () => NODE_TYPES.filter((t) => !NODE_DEFS[t]);
