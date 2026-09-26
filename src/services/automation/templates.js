// Ready-made automations (plan section 9, P1 "Ready templates"). Using a
// template creates a normal DRAFT flow (inactive) the user finishes and turns
// on: fields that need their own data (team members, which date field ...)
// are left blank on purpose - the builder / activation validation asks for them.

const n = (id, type, x, y, parameters = {}) => ({ id, type, position: { x, y }, parameters });
const w = (source, target, sourceHandle = "src") => ({ id: `${source}-${target}-${sourceHandle}`, source, target, sourceHandle });
const T = (y = 40) => n("t", "trigger", 250, y);

export const AUTOMATION_TEMPLATES = [
  {
    key: "new_lead_welcome",
    name: "New lead: welcome + assign",
    description: "When a contact is created, send a WhatsApp welcome and assign the contact to your team in turns.",
    group: "Leads",
    trigger_type: "contact.created",
    trigger_config: {},
    nodes: [
      T(),
      n("welcome", "send_whatsapp", 250, 180, {
        mode: "text",
        to: "contact",
        message: "Hi {{contact.person_name}}, thanks for contacting us! Our team will get in touch with you shortly.",
        sender: "run_as",
      }),
      n("assign", "assign_contact", 250, 340, { mode: "round_robin", user_ids: [] }),
    ],
    connections: [w("t", "welcome"), w("welcome", "assign")],
  },
  {
    key: "website_lead_to_inquiry",
    name: "Website form -> contact + inquiry",
    description: "Connect any website / ad form: creates the contact and an inquiry from the posted fields (name, phone, email, message).",
    group: "Leads",
    trigger_type: "webhook.received",
    trigger_config: {},
    nodes: [
      T(),
      n("contact", "create_contact", 250, 180, {
        on_duplicate: "use_existing",
        fields: [
          { field: "person_name", value: "{{data.name}}" },
          { field: "mobile_number", value: "{{data.phone}}" },
          { field: "email_id", value: "{{data.email}}" },
        ],
      }),
      n("inquiry", "create_inquiry", 250, 360, { description: "{{data.message}}" }),
      n("reply", "webhook_response", 250, 520, { status_code: 200, body: { ok: true } }),
    ],
    connections: [w("t", "contact"), w("contact", "inquiry"), w("inquiry", "reply")],
  },
  {
    key: "quotation_followup",
    name: "Quotation follow-up after 3 days",
    description: "If a quotation is not converted in 3 days, message the customer and create a follow-up task.",
    group: "Sales",
    trigger_type: "cart.not_converted",
    trigger_config: { days: 3, cart_types: [1] },
    nodes: [
      T(),
      n("msg", "send_whatsapp", 250, 180, {
        mode: "text",
        to: "contact",
        message: "Hi {{contact.person_name}}, just checking if you had a chance to review our quotation #{{record.cart_number}}. Happy to help with any questions!",
        sender: "assigned_user",
      }),
      n("task", "create_task", 250, 340, {
        title: "Follow up quotation #{{record.cart_number}}",
        remark: "Quotation not converted after 3 days.",
        assigned_user_ids: ["assigned_user"],
        priority: 2,
        due_in_hours: 24,
        link_contact: true,
      }),
    ],
    connections: [w("t", "msg"), w("msg", "task")],
  },
  {
    key: "invoice_overdue_reminder",
    name: "Invoice overdue reminder",
    description: "The day after an invoice's due date, send the customer a payment reminder and notify the team member.",
    group: "Accounts",
    trigger_type: "cart.due",
    trigger_config: { cart_types: [3], when: "after", days: 1, time: "10:00" },
    nodes: [
      T(),
      n("remind", "send_whatsapp", 250, 180, {
        mode: "text",
        to: "contact",
        message: "Hi {{contact.person_name}}, invoice #{{record.cart_number}} of {{record.grand_total}} was due on {{record.due_date}}. Please arrange the payment. Thank you!",
        sender: "run_as",
      }),
      n("notify", "notify", 250, 340, {
        users: ["assigned_user"],
        title: "Invoice overdue",
        body: "Invoice #{{record.cart_number}} for {{contact.person_name}} is overdue.",
      }),
    ],
    connections: [w("t", "remind"), w("remind", "notify")],
  },
  {
    key: "payment_thank_you",
    name: "Payment received: thank you",
    description: "Send a thank-you message when a payment (credit entry) is recorded for a customer.",
    group: "Accounts",
    trigger_type: "payment.created",
    trigger_config: { rules: [{ field: "record.type", operator: "equals", value: "1" }], match: "AND" },
    nodes: [
      T(),
      n("thanks", "send_whatsapp", 250, 180, {
        mode: "text",
        to: "contact",
        message: "Thank you {{contact.person_name}}! We have received your payment of {{record.amount}}.",
        sender: "run_as",
      }),
    ],
    connections: [w("t", "thanks")],
  },
  {
    key: "task_overdue_escalation",
    name: "Task overdue: escalate to manager",
    description: "When a task is 2 hours overdue, notify the assigned person's manager.",
    group: "Tasks",
    trigger_type: "task.overdue",
    trigger_config: { hours_overdue: 2, task_kind: "task" },
    nodes: [
      T(),
      n("escalate", "notify_manager", 250, 180, {
        title: "Task overdue",
        body: "Task \"{{record.task_title}}\" assigned to {{assigned_user.name}} is overdue.",
        also_whatsapp: false,
        also_email: false,
      }),
    ],
    connections: [w("t", "escalate")],
  },
  {
    key: "birthday_wish",
    name: "Birthday wish",
    description: "Every year on a contact's birthday, send a WhatsApp greeting. Pick which contact date field holds the birthday.",
    group: "Engagement",
    trigger_type: "contact.special_date",
    trigger_config: { field: "", time: "09:00" },
    nodes: [
      T(),
      n("wish", "send_whatsapp", 250, 180, {
        mode: "text",
        to: "contact",
        message: "Happy Birthday {{contact.person_name}}! Wishing you a wonderful year ahead.",
        sender: "run_as",
      }),
    ],
    connections: [w("t", "wish")],
  },
  {
    key: "missed_call_callback",
    name: "Missed call: callback task",
    description: "When a missed call is logged, create a callback task for the assigned team member.",
    group: "Tasks",
    trigger_type: "call.created",
    trigger_config: { rules: [{ field: "record.call_type", operator: "equals", value: "3" }], match: "AND", max_age_hours: 24 },
    nodes: [
      T(),
      n("task", "create_task", 250, 180, {
        title: "Call back {{contact.person_name}} (missed call)",
        remark: "Missed call from {{record.mobile_number}}.",
        assigned_user_ids: ["assigned_user"],
        priority: 3,
        due_in_hours: 2,
        link_contact: true,
      }),
    ],
    connections: [w("t", "task")],
  },
  {
    key: "form_submitted_task",
    name: "Form submitted: create a task",
    description: "When a Form Builder form is submitted, create a task so someone follows up.",
    group: "Forms",
    trigger_type: "form.submitted",
    trigger_config: {},
    nodes: [
      T(),
      n("task", "create_task", 250, 180, {
        title: "Review new form submission",
        remark: "A new form was submitted.",
        assigned_user_ids: [],
        priority: 2,
        due_in_hours: 24,
        link_contact: false,
      }),
    ],
    connections: [w("t", "task")],
  },
];

export const getTemplate = (key) => AUTOMATION_TEMPLATES.find((t) => t.key === key) || null;

export const listTemplates = () =>
  AUTOMATION_TEMPLATES.map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    group: t.group,
    trigger_type: t.trigger_type,
    step_count: t.nodes.length - 1,
  }));
