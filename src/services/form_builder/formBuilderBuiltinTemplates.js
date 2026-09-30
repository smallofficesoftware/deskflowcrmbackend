// Ready-made starter forms (plan L2): "New form" offers these next to a blank
// form. Each is a normal form definition — the person can change anything —
// and each one is checked by formBuilderTemplates.test.js against every
// publish rule, so a starter form can always be published as it is.
//
// Field ids are assigned when a form is created from a template
// (instantiateTemplate in formBuilderTemplates.js); only keys matter here.

const f = (type, key, label, extra = {}) => ({ type, key, label, width: "full", visible_to: "both", ...extra });
const half = { width: "half" };
const section = (key, label) => ({ type: "section-header", key, label, width: "full", visible_to: "both" });

// The Envitro Laboratories "Customer Counselling cum Feasibility Form".
const COUNSELLING = {
  key: "customer_counselling_feasibility",
  title: "Customer Counselling cum Feasibility Form",
  description: "Counsel a customer, check whether we can do the work, decide accept or reject, and prepare the quotation.",
  category: "Sales",
  fields: [
    f("auto-number", "counselling_no", "No.", {
      ...half,
      show_in_list: true,
      auto_number: { prefix: "CF", format: "{PREFIX}/{FY}/{SEQ}", start: 1, padding: 3, reset: "fy" },
    }),
    f("date", "entry_date", "Date", { ...half, default_today: true, edit_rule: { mode: "permission", allow_future: false }, show_in_list: true }),
    f("user", "counselling_done_by", "Counselling done by", { default_current_user: true, show_in_list: true }),

    section("customer_section", "Customer details"),
    f("customer-lookup", "customer", "Find an existing customer", {
      help_text: "Type a name, company or mobile number. Details below fill in automatically.",
      lookup_map: { company_name: "company_name", person_name: "person_name", mobile_number: "contact_no", city: "location" },
    }),
    f("text", "company_name", "Name of company", { ...half, required: true, show_in_list: true }),
    f("text", "location", "Location", half),
    f("text", "person_name", "Person name", half),
    f("phone", "contact_no", "Contact No.", { ...half, format_preset: "mobile" }),

    section("counselling_section", "Counselling details"),
    f("text", "subject", "Subject", { show_in_list: true }),
    f("textarea", "required_service", "Required service or products"),
    f("textarea", "suggested_service", "Suggested service or products"),
    f("text", "applicable_division", "Applicable division", half),
    f("user", "person_responsible", "Name of person responsible", half),

    section("feasibility_section", "Feasibility of the service / products"),
    f("question-table", "feasibility", "Feasibility check", {
      answer_columns: [
        { key: "answer", label: "Yes / No", type: "yes_no" },
        { key: "c2", label: "Service / Product No.", type: "text" },
      ],
      questions: [
        { id: "q1", text: "Are the products or services in our scope of service / products?", required: true },
        ...[
          ["q2", "Is there any available person in our team who can provide the service or products?"],
          ["q3", "Can the product or service be provided by outsourcing?"],
          ["q4", "Are the machinery, chemicals etc. for the above service or products available?"],
          ["q5", "Is the procedure or method available with us?"],
        ].map(([id, text]) => ({ id, text, conditions: { match: "all", rules: [{ field: "feasibility", row: "q1", op: "is", value: "No" }] } })),
      ],
    }),
    f("textarea", "feasibility_conclusion", "Conclusion of the feasibility"),
    f("dropdown", "order_decision", "Order", { ...half, options: ["Accept", "Reject"], required: true, show_in_list: true }),
    f("textarea", "reason_of_rejection", "Reason of rejection", {
      conditions: { match: "all", rules: [{ field: "order_decision", op: "is", value: "Reject" }] },
      required_conditions: { match: "all", rules: [{ field: "order_decision", op: "is", value: "Reject" }] },
    }),

    section("quotation_section", "If the order can be accepted, issue a quotation with the details below"),
    f("repeater", "quotation_items", "Quotation details", {
      columns: [
        { key: "particular", type: "text", label: "Particular" },
        { key: "item_value", type: "number", label: "Item value" },
        { key: "nos", type: "number", label: "Nos" },
        { key: "total_amount", type: "calculation", label: "Total amount", formula: "[item_value] * [nos]", decimals: 2 },
      ],
    }),
    f("calculation", "grand_total", "Total amount", { formula: "SUM([quotation_items.total_amount])", decimals: 2, result_type: "number" }),

    section("sign_section", "Sign-off"),
    f("signature", "sign_counsellor", "Sign — Counsellor", half),
    f("signature", "sign_division_head", "Sign — Division head", half),
    f("signature", "sign_quotation_issuer", "Sign — Quotation issuer", half),
    f("signature", "sign_checked_by", "Sign — Checked by", half),
  ],
};

const INQUIRY = {
  key: "customer_inquiry",
  title: "Customer Inquiry",
  description: "A simple inquiry form. Turn on the public link to put it on your website or share it on WhatsApp.",
  category: "Sales",
  fields: [
    f("auto-number", "inquiry_no", "Inquiry No.", { ...half, show_in_list: true, auto_number: { prefix: "INQ", format: "{PREFIX}-{YY}{MM}-{SEQ}", start: 1, padding: 4, reset: "month" } }),
    f("date", "inquiry_date", "Date", { ...half, default_today: true, edit_rule: { mode: "never" }, show_in_list: true }),
    section("who_section", "About you"),
    f("text", "name", "Your name", { ...half, required: true, show_in_list: true }),
    f("text", "company", "Company", half),
    f("phone", "mobile", "Mobile number", { ...half, required: true, format_preset: "mobile", show_in_list: true }),
    f("email", "email", "Email", { ...half, format_preset: "email" }),
    f("text", "city", "City", half),
    section("need_section", "What do you need?"),
    f("dropdown", "interested_in", "Interested in", { options: ["Product enquiry", "Price / quotation", "Service", "Other"], show_in_list: true }),
    f("textarea", "message", "Tell us more"),
    f("dropdown", "heard_about_us", "How did you hear about us?", { visible_to: "internal", options: ["Website", "Referral", "Walk-in", "Social media", "Advertisement", "Other"] }),
  ],
};

const SITE_VISIT = {
  key: "site_visit_report",
  title: "Site Visit Report",
  description: "Record a visit with photos, a location stamp, a pass / fail checklist and the customer's signature.",
  category: "Field work",
  fields: [
    f("auto-number", "visit_no", "Visit No.", { ...half, show_in_list: true, auto_number: { prefix: "SV", format: "{PREFIX}/{FYS}/{SEQ}", start: 1, padding: 4, reset: "fy" } }),
    f("date", "visit_date", "Date", { ...half, default_today: true, edit_rule: { mode: "permission", past_days: 2, allow_future: false }, show_in_list: true }),
    f("time", "arrival_time", "Arrival time", half),
    f("time", "departure_time", "Departure time", half),
    f("user", "visited_by", "Visited by", { default_current_user: true, show_in_list: true }),
    section("site_section", "Site"),
    f("customer-lookup", "customer", "Customer", { lookup_map: { company_name: "site_name", city: "site_city" } }),
    f("text", "site_name", "Site / customer name", { ...half, required: true, show_in_list: true }),
    f("text", "site_city", "City", half),
    f("location", "site_location", "Site location", { help_text: "Tap Capture my location while you are at the site." }),
    f("barcode", "asset_code", "Equipment / asset code", { help_text: "Scan or type the code on the equipment." }),
    section("check_section", "Checklist"),
    f("question-table", "checklist", "Site checklist", {
      scored: true,
      answer_columns: [
        { key: "answer", label: "Result", type: "pass_fail" },
        { key: "c2", label: "Remarks", type: "text" },
      ],
      questions: [
        { id: "q1", text: "Safety gear in use", required: true },
        { id: "q2", text: "Equipment working properly", required: true },
        { id: "q3", text: "Site clean and tidy" },
        { id: "q4", text: "Records up to date" },
      ],
    }),
    f("calculation", "score_percent", "Score (%)", {
      formula: "IF([checklist.max_score] = 0, 0, [checklist.score] / [checklist.max_score] * 100)",
      decimals: 0,
      result_type: "number",
      result_ranges: [
        { from: 0, label: "Needs attention" },
        { from: 60, label: "Fair" },
        { from: 80, label: "Good" },
      ],
      show_in_list: true,
    }),
    section("proof_section", "Proof of visit"),
    f("image", "photo_before", "Photo — before", { ...half, image_camera: true, image_stamp: { datetime: true, location: true } }),
    f("image", "photo_after", "Photo — after", { ...half, image_camera: true, image_stamp: { datetime: true, location: true } }),
    f("textarea", "observations", "Observations and actions"),
    f("signature", "customer_signature", "Customer signature"),
  ],
};

const FEEDBACK = {
  key: "customer_feedback",
  title: "Customer Feedback",
  description: "Collect ratings and comments. Works well as a public link or a QR code at the counter.",
  category: "Feedback",
  fields: [
    f("date", "feedback_date", "Date", { ...half, default_today: true, edit_rule: { mode: "never" } }),
    f("text", "name", "Your name (optional)", half),
    f("phone", "mobile", "Mobile number (optional)", { ...half, format_preset: "mobile" }),
    section("rate_section", "How did we do?"),
    f("rating", "rating_quality", "Quality", { max: 5, show_in_list: true }),
    f("rating", "rating_service", "Service and support", { max: 5 }),
    f("rating", "rating_delivery", "Delivery / turnaround", { max: 5 }),
    f("calculation", "average_rating", "Average rating", { formula: "ROUND(([rating_quality] + [rating_service] + [rating_delivery]) / 3, 1)", decimals: 1, result_type: "number", show_in_list: true }),
    f("dropdown", "would_recommend", "Would you recommend us?", { options: ["Yes", "Maybe", "No"], required: true, show_in_list: true }),
    f("textarea", "comments", "Comments"),
    f("textarea", "improve", "What could we do better?", {
      conditions: { match: "any", rules: [{ field: "would_recommend", op: "is", value: "No" }, { field: "would_recommend", op: "is", value: "Maybe" }] },
    }),
  ],
};

const SERVICE_REQUEST = {
  key: "service_request",
  title: "Service Request",
  description: "Log a service or repair request with priority, photo of the problem and a preferred visit time.",
  category: "Service",
  fields: [
    f("auto-number", "request_no", "Request No.", { ...half, show_in_list: true, auto_number: { prefix: "SR", format: "{PREFIX}/{YY}{MM}/{SEQ}", start: 1, padding: 4, reset: "month" } }),
    f("date", "request_date", "Date", { ...half, default_today: true, edit_rule: { mode: "permission" }, show_in_list: true }),
    section("cust_section", "Customer"),
    f("customer-lookup", "customer", "Find an existing customer", { lookup_map: { company_name: "company_name", person_name: "contact_person", mobile_number: "contact_mobile", address: "address" } }),
    f("text", "company_name", "Customer / company", { ...half, required: true, show_in_list: true }),
    f("text", "contact_person", "Contact person", half),
    f("phone", "contact_mobile", "Mobile number", { ...half, required: true, format_preset: "mobile" }),
    f("textarea", "address", "Address of the service"),
    section("problem_section", "The problem"),
    f("dropdown", "service_type", "Type of service", { ...half, options: ["Installation", "Repair", "Maintenance", "Inspection", "Other"], show_in_list: true }),
    f("dropdown", "priority", "Priority", { ...half, options: ["Low", "Medium", "High", "Urgent"], required: true, show_in_list: true }),
    f("barcode", "serial_no", "Equipment serial no.", { help_text: "Scan or type the serial number." }),
    f("textarea", "problem", "Describe the problem", { required: true }),
    f("image", "problem_photo", "Photo of the problem", { image_camera: true }),
    section("visit_section", "Visit"),
    f("date", "preferred_date", "Preferred visit date", { ...half, edit_rule: { mode: "always", past_days: 0 } }),
    f("time", "preferred_time", "Preferred time", half),
    f("user", "assigned_to", "Assigned to", { visible_to: "internal" }),
  ],
};

export const BUILTIN_TEMPLATES = [COUNSELLING, INQUIRY, SITE_VISIT, FEEDBACK, SERVICE_REQUEST];

export function getBuiltinTemplate(key) {
  return BUILTIN_TEMPLATES.find((t) => t.key === key) || null;
}
