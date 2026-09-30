import { requestContext } from "../../config/context.js";
import callServiceMethod from "../../controllers/baseController.js";
import { resBadRequest, resSuccess } from "../../utils/sharedFunctions.js";
import { getRegisteredModel, resolveDynamicColumns } from "../report_builder/modelRegistry.js";

// Field list for the automation builder: which {{ variables }} a flow can use
// for the record its trigger fired on (plus the assigned user), so a user
// writing e.g. a webhook body can see what is available. Labels and the
// company's custom fields come from the Report Builder model registry - the
// same source, no second list to maintain.

const RECORD_TYPE_TO_MODEL_KEY = {
  contact: "contacts",
  inquiry: "inquiries",
  task: "task_managements",
  cart: "carts",
};

const ASSIGNED_USER_FIELDS = [
  { path: "assigned_user.id", label: "Assigned User ID", type: "number" },
  { path: "assigned_user.name", label: "Assigned User Name", type: "string" },
  { path: "assigned_user.email", label: "Assigned User Email", type: "string" },
  { path: "assigned_user.mobile", label: "Assigned User Mobile", type: "string" },
];

export const getRecordFields = async (req) => {
  try {
    const recordType = String(req.body?.record_type || "");
    const modelKey = RECORD_TYPE_TO_MODEL_KEY[recordType];
    const entry = modelKey ? getRegisteredModel(modelKey) : null;
    if (!entry) return resSuccess({ data: { item: { record_type: recordType, groups: [] } } });

    const store = requestContext.getStore() || {};
    const company = Number(store.companyId || req.user?.companyId);
    const dynamic = company && entry.customFieldFormType ? await resolveDynamicColumns(req.tenantDB, company, entry.customFieldFormType) : {};

    const recordFields = [{ path: "record.id", label: "Record ID", type: "number" }];
    Object.entries(entry.columns).forEach(([key, def]) => {
      if (key === "id") return; // registry's COUNT helper, not a real field label
      recordFields.push({ path: `record.${key}`, label: def.label, type: def.type });
    });
    Object.entries(dynamic).forEach(([key, def]) => {
      recordFields.push({ path: `record.${key}`, label: def.label, type: def.type, custom: true });
    });

    const groups = [
      { key: "record", label: entry.label, fields: recordFields },
      { key: "assigned_user", label: "Assigned user", fields: ASSIGNED_USER_FIELDS },
    ];

    // Order / document lines: the whole array is one variable; the per-line
    // fields are listed for reference (info only - they are the keys inside
    // each array element, not separate variables).
    if (recordType === "cart") {
      const itemEntry = getRegisteredModel("cart_items");
      const itemFields = [{ path: "record.items", label: "All items (array)", type: "array" }];
      Object.entries(itemEntry?.columns || {}).forEach(([key, def]) => {
        if (key === "id") return;
        itemFields.push({ path: key, label: def.label, type: def.type, info: true });
      });
      groups.push({ key: "items", label: "Order items - fields inside each item", fields: itemFields });
    }

    return resSuccess({ data: { item: { record_type: recordType, groups } } });
  } catch (e) {
    return resBadRequest({ developer_msg: `getRecordFields: ${e.message}` });
  }
};

export const getRecordFieldsController = async (req, res) =>
  callServiceMethod(req, res, getRecordFields(req), "automationGetRecordFields");
