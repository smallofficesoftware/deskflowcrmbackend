import { QueryTypes } from "sequelize";
import { requestContext } from "../../config/context.js";
import callServiceMethod from "../../controllers/baseController.js";
import { resBadRequest, resSuccess } from "../../utils/sharedFunctions.js";
import { getRegisteredModel } from "../report_builder/modelRegistry.js";
import { RECORD_TYPE_TO_TABLE } from "./constants.js";

// Field list for the automation builder: which {{ variables }} a flow can use
// for the record its trigger fired on (plus the assigned user), so a user
// writing e.g. a webhook body can see what is available.
//   - every real column of the record's table (labels from the Report Builder
//     model registry where it has one, else a readable form of the column name)
//   - the company's custom fields (their own titles)
//   - values automations add on top (names, plain dates, clean line items - see enrich.js)

const RECORD_TYPE_TO_MODEL_KEY = {
  contact: "contacts",
  inquiry: "inquiries",
  task: "task_managements",
  cart: "carts",
};

// custom_field_form_masters.form_type values that belong to each record type
// (frontend pageTypesCustomFieldList): cart = the sales / purchase document types.
const CUSTOM_FORM_TYPES = {
  contact: [1],
  inquiry: [2],
  task: [14, 15],
  cart: [5, 6, 7, 8, 9, 10, 11, 12, 13, 16],
};
const DOCUMENT_TYPE_NAMES = {
  5: "Quotation", 6: "Sales Order", 7: "Sales Invoice", 8: "Purchase Invoice", 9: "Purchase Order",
  10: "Return Sales Invoice", 11: "Return Purchase Invoice", 12: "GRN", 13: "Dispatch", 16: "Proforma Invoice",
};

// Internal / scope columns and unnamed custom slots - not useful to send.
const HIDDEN_COLUMN = /^(company_masters_id|a_application_login_id|isDelete|isActive|s_timestemp|temp|miracle_.*|raw_mobile_number|is_unread|is_read_by_.*|is_pin.*|pinned_message|sync_whatsapp)$/;
const CUSTOM_SLOT_COLUMN = /_column_/; // cntc_column_text_1, carts_column_number_2, column_1 ... only shown when a custom field names them
const humanize = (name) => name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const ASSIGNED_USER_FIELDS = [
  { path: "assigned_user.id", label: "Assigned User ID", type: "number" },
  { path: "assigned_user.name", label: "Assigned User Name", type: "string" },
  { path: "assigned_user.email", label: "Assigned User Email", type: "string" },
  { path: "assigned_user.mobile", label: "Assigned User Mobile", type: "string" },
];

const CONTACT_FIELDS_FOR_OTHER_RECORDS = [
  { path: "contact.person_name", label: "Contact Name", type: "string" },
  { path: "contact.company_name", label: "Company Name", type: "string" },
  { path: "contact.mobile_number", label: "Mobile", type: "string" },
  { path: "contact.email_id", label: "Email", type: "string" },
  { path: "contact.gst_number", label: "GST Number", type: "string" },
];

const ADDED_FIELDS = {
  contact: [
    { path: "record.source_type_name", label: "Source Type (name)", type: "string" },
    { path: "record.label_names", label: "Labels (names)", type: "string" },
    { path: "record.status_name", label: "Status (name)", type: "string" },
    { path: "record.price_list_name", label: "Price List (name)", type: "string" },
  ],
  cart: [
    { path: "record.invoice_date", label: "Document Date (YYYY-MM-DD)", type: "date" },
    { path: "record.invoice_time", label: "Document Time (HH:mm)", type: "string" },
    { path: "record.delivery_date", label: "Due / Delivery Date (YYYY-MM-DD)", type: "date" },
    { path: "record.line_items", label: "Items with clean field names (array)", type: "array" },
  ],
};

const CLEAN_ITEM_KEYS = [
  ["no", "Row number"], ["product_code", "Product code"], ["product_name", "Product name"],
  ["particular_description", "Description"], ["hsn_sac_code", "HSN / SAC code"], ["unit_name", "Unit"],
  ["qty", "Quantity"], ["rate", "Rate"], ["amount", "Amount"], ["gst_percent", "GST %"],
  ["discount_percent", "Discount %"], ["product_image", "Product image URL"],
];

export const getRecordFields = async (req) => {
  try {
    const recordType = String(req.body?.record_type || "");
    const table = RECORD_TYPE_TO_TABLE[recordType];
    const modelKey = RECORD_TYPE_TO_MODEL_KEY[recordType];
    if (!table || !modelKey) return resSuccess({ data: { item: { record_type: recordType, groups: [] } } });

    const registryColumns = getRegisteredModel(modelKey)?.columns || {};
    const store = requestContext.getStore() || {};
    const company = Number(store.companyId || req.user?.companyId);

    // Custom fields of this company for this record type -> column -> title.
    const formTypes = CUSTOM_FORM_TYPES[recordType] || [];
    const customRows = company
      ? await req.tenantDB.query(
          "SELECT reference_column_name, title, form_type, applicable_modules FROM custom_field_form_masters WHERE company_masters_id = ? AND isDelete = 0",
          { replacements: [company], type: QueryTypes.SELECT }
        )
      : [];
    const customByColumn = new Map();
    customRows.forEach((r) => {
      const mods = String(r.applicable_modules || "").split(",").map((m) => Number(m.trim())).filter(Boolean);
      const belongs = formTypes.includes(Number(r.form_type)) || mods.some((m) => formTypes.includes(m));
      if (!belongs || !r.reference_column_name) return;
      const docName = recordType === "cart" ? DOCUMENT_TYPE_NAMES[Number(r.form_type)] : "";
      customByColumn.set(r.reference_column_name, docName ? `${r.title} (${docName})` : r.title);
    });

    const columns = await req.tenantDB.query(`SHOW COLUMNS FROM \`${table}\``, { type: QueryTypes.SELECT });
    const recordFields = [];
    columns.forEach(({ Field }) => {
      if (HIDDEN_COLUMN.test(Field)) return;
      const custom = customByColumn.get(Field);
      if (custom) {
        recordFields.push({ path: `record.${Field}`, label: custom, custom: true });
        return;
      }
      if (CUSTOM_SLOT_COLUMN.test(Field) || /^column_\d+$/.test(Field)) return; // unnamed custom slot
      const reg = registryColumns[Field];
      if (reg?.filterOnly) return;
      recordFields.push({ path: `record.${Field}`, label: reg?.label?.replace(/\s*\((has label|CSV)\)$/i, "") || humanize(Field), type: reg?.type });
    });

    const groups = [{ key: "record", label: getRegisteredModel(modelKey)?.label || humanize(table), fields: recordFields }];
    if (ADDED_FIELDS[recordType]) groups.push({ key: "added", label: "Added by automation (names, dates, items)", fields: ADDED_FIELDS[recordType] });
    if (recordType !== "contact") groups.push({ key: "contact", label: "The contact", fields: CONTACT_FIELDS_FOR_OTHER_RECORDS });
    groups.push({ key: "assigned_user", label: "Assigned user", fields: ASSIGNED_USER_FIELDS });

    if (recordType === "cart") {
      groups.push({
        key: "items",
        label: "Order items - fields inside each item",
        fields: [
          { path: "record.items", label: "All items (array, raw column names)", type: "array" },
          ...CLEAN_ITEM_KEYS.map(([key, label]) => ({ path: key, label: `${label} (in record.line_items)`, info: true })),
        ],
      });
    }

    return resSuccess({ data: { item: { record_type: recordType, groups } } });
  } catch (e) {
    return resBadRequest({ developer_msg: `getRecordFields: ${e.message}` });
  }
};

export const getRecordFieldsController = async (req, res) =>
  callServiceMethod(req, res, getRecordFields(req), "automationGetRecordFields");
