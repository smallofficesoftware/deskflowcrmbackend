// Hardcoded whitelist — a report_definitions row's model_key/columns_json
// only ever gets resolved through this map, never used to reference an
// arbitrary table/column string. queryEngine.js is the only consumer.
//
// Never add company_masters_id / a_application_login_id / isDelete here —
// those are scope, injected by queryEngine.js after user filters, never
// something a report definition can filter/group on itself.
//
// `relations` (optional per entry) is a whitelisted, pre-declared join —
// NOT arbitrary joins. Selected as dotted keys from the frontend, e.g.
// "customer.person_name". Resolved by queryEngine.js via one batched
// second query + a JS Map merge (this codebase's own existing join
// convention — see customerSalesPurchaseReportServices.js — never a
// Sequelize `include`, since no association is declared anywhere in this
// codebase). v1 is select/display only: relation columns are never
// filterable/groupable/aggregatable, enforced by simply not appearing in
// those column lists.
//
// A relation with `matchMode: "csv"` points at a column storing a
// comma-separated list of ids (e.g. contacts.lable, task_managements.label_id
// — confirmed by reading the models directly, not a real scalar FK) —
// queryEngine.js splits/joins per row instead of a plain Map.get. A base
// column with `type: "csv"` supports exactly one filter operator,
// "findInSet", built via Sequelize's own fn()/col() (bound value, not
// string-interpolated SQL — same safety class as every other operator here).
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { callhistoryModel } from "../../models/activities/callhistoryModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import { reminderMessagesModel } from "../../models/activities/reminderMessagesModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import { visitsModel } from "../../models/activities/visitModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import currencyModel from "../../models/configuration/currencyModel.js";
import { expenseTypeModel } from "../../models/hr/expenseTypeModel.js";
import { expensesModel } from "../../models/hr/expensesModel.js";
import { salaryRegisterModel } from "../../models/hr/salaryRegisterModel.js";
import { labelModel } from "../../models/masters/labelModel.js";
import { sourceTypesModel } from "../../models/masters/sourceTypeMode.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { taskCategoryModel } from "../../models/masters/taskCategoryModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productModel } from "../../models/product_settings/productModel.js";

// COUNT needs a real column to wrap (fn("COUNT", col("id"))) — every table
// that supports a group+count report gets this, not a new engine concept.
const COUNT_COLUMN = { id: { label: "Count", type: "number", filterable: false, sortable: false, groupable: false, aggregatable: ["count"] } };

const PRODUCT_COLUMNS = {
  product_name: { label: "Product Name", type: "string", filterable: true, sortable: true, groupable: true },
  category_id: { label: "Category", type: "lookup", filterable: true, sortable: false, groupable: true },
  rate: { label: "Sale Rate", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
  min_stock_quantity: { label: "Min Stock Qty", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
  created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
};

export const MODEL_REGISTRY = {
  products: {
    label: "Products",
    getModel: (tenantDB) => productModel(tenantDB),
    columns: PRODUCT_COLUMNS,
  },

  contacts: {
    label: "Contacts",
    getModel: (tenantDB) => contactModel(tenantDB),
    // form_type: 1 (confirmed in customFieldFormService.js's getColumnName —
    // 1 -> cntc_column_*) — enables per-company dynamic custom-field columns,
    // resolved fresh per request by queryEngine.js, merged into the static
    // whitelist below (never mutating it). See resolveDynamicColumns().
    customFieldFormType: 1,
    columns: {
      person_name: { label: "Contact Name", type: "string", filterable: true, sortable: true, groupable: false },
      company_name: { label: "Company Name", type: "string", filterable: true, sortable: true, groupable: true },
      mobile_number: { label: "Mobile", type: "string", filterable: true, sortable: false, groupable: false },
      contact_status: { label: "Status", type: "lookup", filterable: true, sortable: false, groupable: true },
      source_type_id: { label: "Source Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      // CSV-of-ids (confirmed in contactModel.js — not a scalar FK). Only
      // "findInSet" is a valid operator; see queryEngine.js.
      lable: { label: "Labels (has label)", type: "csv", filterable: true, sortable: false, groupable: false },
      // Already plain display strings on the row itself, not FK ids — no
      // relation needed (confirmed by reading contactModel.js in full).
      country: { label: "Country", type: "string", filterable: true, sortable: false, groupable: true },
      state: { label: "State", type: "string", filterable: true, sortable: false, groupable: true },
      city: { label: "City", type: "string", filterable: true, sortable: false, groupable: true },
      area: { label: "Area", type: "string", filterable: true, sortable: false, groupable: true },
      created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
      ...COUNT_COLUMN,
    },
    relations: {
      sourceType: {
        label: "Source Type",
        foreignKey: "source_type_id",
        getModel: (tenantDB) => sourceTypesModel(tenantDB),
        targetKey: "id",
        columns: {
          source_name: { label: "Source Name", type: "string" },
        },
      },
      status: {
        label: "Status",
        foreignKey: "contact_status",
        getModel: (tenantDB) => stagestatusModel(tenantDB),
        targetKey: "id",
        columns: {
          name: { label: "Status Name", type: "string" },
        },
      },
      label: {
        label: "Labels",
        matchMode: "csv",
        foreignKey: "lable",
        getModel: (tenantDB) => labelModel(tenantDB),
        targetKey: "id",
        columns: {
          lable_name: { label: "Label Names", type: "string" },
        },
      },
    },
  },

  carts: {
    label: "Orders / Carts",
    getModel: (tenantDB) => cartModel(tenantDB),
    columns: {
      cart_number: { label: "Order Number", type: "string", filterable: true, sortable: true, groupable: false },
      type: { label: "Order Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      cart_date: { label: "Order Date", type: "date", filterable: true, sortable: true, groupable: false },
      cart_status: { label: "Status", type: "lookup", filterable: true, sortable: false, groupable: true },
      to_customer_id: { label: "Customer", type: "lookup", filterable: true, sortable: false, groupable: true },
      grand_total: { label: "Grand Total", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
      ...COUNT_COLUMN,
    },
    relations: {
      customer: {
        label: "Customer",
        foreignKey: "to_customer_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        columns: {
          person_name: { label: "Contact Name", type: "string" },
          company_name: { label: "Company Name", type: "string" },
          mobile_number: { label: "Mobile", type: "string" },
          gst_number: { label: "GSTIN", type: "string" },
        },
      },
      currency: {
        label: "Currency",
        foreignKey: "currency_id",
        // Pre-built instance bound to the MASTER db (confirmed: currencies
        // lives only in smalloffice/smalloffice_prod, never in a tenant
        // DB) — tenantDB arg intentionally unused, not a mistake.
        getModel: () => currencyModel,
        targetKey: "id",
        columns: {
          name: { label: "Currency", type: "string" },
          symbol: { label: "Symbol", type: "string" },
        },
      },
    },
  },

  cart_items: {
    label: "Order Items",
    getModel: (tenantDB) => cartItemModel(tenantDB),
    columns: {
      item_product_name: { label: "Product Name", type: "string", filterable: true, sortable: true, groupable: true },
      item_qty: { label: "Quantity", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      item_rate: { label: "Rate", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      item_total: { label: "Total", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
    },
    relations: {
      product: {
        label: "Product",
        foreignKey: "item_product_id",
        getModel: (tenantDB) => productModel(tenantDB),
        targetKey: "id",
        // Reuses products' own column defs — not a duplicate definition.
        columns: { product_name: PRODUCT_COLUMNS.product_name },
      },
      category: {
        label: "Category",
        foreignKey: "item_category_id",
        getModel: (tenantDB) => categoryModel(tenantDB),
        targetKey: "id",
        columns: {
          category_name: { label: "Category Name", type: "string" },
        },
      },
    },
  },

  task_managements: {
    label: "Tasks",
    getModel: (tenantDB) => taskManagementModel(tenantDB),
    // form_type: 14 (getColumnName -> task_column_*). 15 also maps to tasks
    // (support-ticket sub-type) — not distinguished here, a known simplification.
    customFieldFormType: 14,
    columns: {
      task_title: { label: "Task Title", type: "string", filterable: true, sortable: true, groupable: false },
      task_priority: { label: "Priority", type: "lookup", filterable: true, sortable: false, groupable: true },
      task_type: { label: "Task Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Plain fixed-code TINYINT (confirmed in taskManagementModel.js), not
      // an FK to stage_status_masters — no relation needed/possible.
      status: { label: "Status", type: "lookup", filterable: true, sortable: false, groupable: true },
      // CSV-of-ids (confirmed in taskManagementModel.js). Only "findInSet"
      // is a valid operator; see queryEngine.js.
      label_id: { label: "Labels (has label)", type: "csv", filterable: true, sortable: false, groupable: false },
      task_enddate: { label: "Due Date", type: "date", filterable: true, sortable: true, groupable: false },
      created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
      ...COUNT_COLUMN,
    },
    relations: {
      label: {
        label: "Labels",
        matchMode: "csv",
        foreignKey: "label_id",
        getModel: (tenantDB) => labelModel(tenantDB),
        targetKey: "id",
        columns: {
          lable_name: { label: "Label Names", type: "string" },
        },
      },
      category: {
        label: "Category",
        foreignKey: "task_category_id",
        getModel: (tenantDB) => taskCategoryModel(tenantDB),
        targetKey: "id",
        columns: {
          task_category_name: { label: "Category Name", type: "string" },
        },
      },
      contact: {
        label: "Contact",
        foreignKey: "contact_masters_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        columns: {
          person_name: { label: "Contact Name", type: "string" },
          company_name: { label: "Company Name", type: "string" },
        },
      },
    },
  },

  inquiries: {
    label: "Inquiries",
    getModel: (tenantDB) => inquiryModel(tenantDB),
    // form_type: 2 (getColumnName -> column_*).
    customFieldFormType: 2,
    columns: {
      description: { label: "Description", type: "string", filterable: true, sortable: false, groupable: false },
      qty: { label: "Quantity", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      contact_status: { label: "Status", type: "lookup", filterable: true, sortable: false, groupable: true },
      source_type_id: { label: "Source Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Plain INTEGER FK (confirmed in inquiryModel.js — unlike contacts.lable
      // / task_managements.label_id, this one is scalar, not CSV).
      label_id: { label: "Label", type: "lookup", filterable: true, sortable: false, groupable: true },
      inquiry_date_time: { label: "Inquiry Date", type: "date", filterable: true, sortable: true, groupable: false },
      ...COUNT_COLUMN,
    },
    relations: {
      label: {
        label: "Label",
        foreignKey: "label_id",
        getModel: (tenantDB) => labelModel(tenantDB),
        targetKey: "id",
        columns: {
          lable_name: { label: "Label Name", type: "string" },
        },
      },
      contact: {
        label: "Contact",
        foreignKey: "contact_master_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        columns: {
          person_name: { label: "Contact Name", type: "string" },
          company_name: { label: "Company Name", type: "string" },
        },
      },
      category: {
        label: "Category",
        foreignKey: "category_id",
        getModel: (tenantDB) => categoryModel(tenantDB),
        targetKey: "id",
        columns: {
          category_name: { label: "Category Name", type: "string" },
        },
      },
      sourceType: {
        label: "Source Type",
        foreignKey: "source_type_id",
        getModel: (tenantDB) => sourceTypesModel(tenantDB),
        targetKey: "id",
        columns: {
          source_name: { label: "Source Name", type: "string" },
        },
      },
      status: {
        label: "Status",
        foreignKey: "contact_status",
        getModel: (tenantDB) => stagestatusModel(tenantDB),
        targetKey: "id",
        columns: {
          name: { label: "Status Name", type: "string" },
        },
      },
    },
  },

  account_transactions: {
    label: "Account Transactions",
    getModel: (tenantDB) => accountTransactionsModel(tenantDB),
    columns: {
      amount: { label: "Amount", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      type: { label: "Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      amount_type: { label: "Amount Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      mode: { label: "Payment Mode", type: "lookup", filterable: true, sortable: false, groupable: true },
      payment_date_time: { label: "Payment Date", type: "date", filterable: true, sortable: true, groupable: false },
      remark: { label: "Remark", type: "string", filterable: true, sortable: false, groupable: false },
      ...COUNT_COLUMN,
    },
    relations: {
      contact: {
        label: "Contact",
        foreignKey: "contact_masters_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        columns: {
          person_name: { label: "Contact Name", type: "string" },
          company_name: { label: "Company Name", type: "string" },
        },
      },
      paymentType: {
        label: "Payment Type",
        foreignKey: "mode",
        getModel: (tenantDB) => paymentTypeModel(tenantDB),
        targetKey: "id",
        columns: {
          payment_type_name: { label: "Payment Type", type: "string" },
        },
      },
    },
    // NOT whitelisted: reference_id/reference_table (polymorphic — the
    // target table varies per row, not a static FK a relation can point
    // at). approve_by_a_application_login_id would need a_application_logins,
    // a master-DB-only table like currencyModel above — skipped for now,
    // same pattern (getModel: () => loginModel, non-factory) would apply.
  },

  visits: {
    label: "Visits",
    getModel: (tenantDB) => visitsModel(tenantDB),
    // form_type: 3 (getColumnName -> visit_column_*).
    customFieldFormType: 3,
    columns: {
      person_name: { label: "Person Name", type: "string", filterable: true, sortable: true, groupable: false },
      remark: { label: "Remark", type: "string", filterable: true, sortable: false, groupable: false },
      start_date: { label: "Start Date", type: "date", filterable: true, sortable: true, groupable: false },
      end_date: { label: "End Date", type: "date", filterable: true, sortable: true, groupable: false },
      created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
    },
    relations: {
      contact: {
        label: "Contact",
        foreignKey: "contact_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        columns: {
          person_name: { label: "Contact Name", type: "string" },
          company_name: { label: "Company Name", type: "string" },
        },
      },
    },
    // visit_type_id -> visit_type_masters skipped: that table has no real
    // display-name column (visit_type is a plain INTEGER code, confirmed
    // by reading visitTypeModel.js), so a relation there would just swap
    // one numeric id for another — no value over the raw column.
  },

  call_histories: {
    label: "Call History",
    getModel: (tenantDB) => callhistoryModel(tenantDB),
    columns: {
      call_type: { label: "Call Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      call_date_time: { label: "Call Date", type: "date", filterable: true, sortable: true, groupable: false },
      duration: { label: "Duration (sec)", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ...COUNT_COLUMN,
    },
    relations: {
      contact: {
        label: "Contact",
        foreignKey: "contact_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        columns: {
          person_name: { label: "Contact Name", type: "string" },
          company_name: { label: "Company Name", type: "string" },
        },
      },
    },
  },

  reminder_messages: {
    label: "Reminders",
    getModel: (tenantDB) => reminderMessagesModel(tenantDB),
    columns: {
      // Plain fixed-code TINYINT (0/1 pending-completed style), not an FK —
      // same as task_managements.status above.
      status: { label: "Status", type: "lookup", filterable: true, sortable: false, groupable: true },
      reminder_data_time: { label: "Reminder Date", type: "date", filterable: true, sortable: true, groupable: false },
      remark: { label: "Remark", type: "string", filterable: true, sortable: false, groupable: false },
      ...COUNT_COLUMN,
    },
    relations: {
      contact: {
        label: "Contact",
        foreignKey: "contact_masters_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        columns: {
          person_name: { label: "Contact Name", type: "string" },
          company_name: { label: "Company Name", type: "string" },
        },
      },
      task: {
        label: "Task",
        foreignKey: "task_id",
        getModel: (tenantDB) => taskManagementModel(tenantDB),
        targetKey: "id",
        columns: {
          task_title: { label: "Task Title", type: "string" },
        },
      },
    },
  },

  expenses: {
    label: "Expenses",
    getModel: (tenantDB) => expensesModel(tenantDB),
    columns: {
      amount: { label: "Amount", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      expense_date: { label: "Expense Date", type: "date", filterable: true, sortable: true, groupable: false },
      expense_status: { label: "Status", type: "lookup", filterable: true, sortable: false, groupable: true },
      remark: { label: "Remark", type: "string", filterable: true, sortable: false, groupable: false },
      ...COUNT_COLUMN,
    },
    relations: {
      expenseType: {
        label: "Expense Type",
        foreignKey: "expense_type_id",
        getModel: (tenantDB) => expenseTypeModel(tenantDB),
        targetKey: "id",
        columns: {
          expense_name: { label: "Expense Type", type: "string" },
        },
      },
      employee: {
        label: "Employee",
        foreignKey: "a_application_login_id",
        // Pre-built instance bound to the MASTER db (a_application_logins
        // lives only in smalloffice/smalloffice_prod, never a tenant DB —
        // same pattern as carts.currency above).
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Employee", type: "string" },
        },
      },
    },
  },

  salary_registers: {
    label: "Salary Register",
    getModel: (tenantDB) => salaryRegisterModel(tenantDB),
    columns: {
      year: { label: "Year", type: "number", filterable: true, sortable: true, groupable: true },
      month: { label: "Month", type: "number", filterable: true, sortable: true, groupable: true },
      total_earning: { label: "Total Earning", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      total_deduction: { label: "Total Deduction", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      net_bank_pay: { label: "Net Pay", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ...COUNT_COLUMN,
    },
    relations: {
      employee: {
        label: "Employee",
        foreignKey: "employee_id",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Employee", type: "string" },
        },
      },
    },
  },
};

export const getRegisteredModel = (modelKey) => MODEL_REGISTRY[modelKey];

// Serializable view for the frontend's table/column picker — strips
// getModel (a function, not meaningful to a client) and reshapes into
// arrays the builder form can map over directly. Relation columns are
// exposed under their own `relations` array (not flattened into the base
// `columns` array) so the frontend can render them as a separate "Related:
// X" sub-group and never send them through the filter/group-by pickers.
//
// tenantDB/company_masters_id are optional so this stays callable without
// company context (e.g. a future admin-facing "what tables exist" view) —
// when passed, each table with a customFieldFormType gets that company's
// real custom fields merged in (same resolveDynamicColumns() queryEngine.js
// uses per run), each tagged `dynamic: true` so the frontend can show them
// distinctly from the fixed columns.
export const listModelRegistry = async (tenantDB, company_masters_id) =>
  Promise.all(
    Object.entries(MODEL_REGISTRY).map(async ([key, entry]) => {
      const dynamicColumns =
        tenantDB && company_masters_id && entry.customFieldFormType
          ? await resolveDynamicColumns(tenantDB, company_masters_id, entry.customFieldFormType)
          : {};

      return {
        key,
        label: entry.label,
        columns: [
          ...Object.entries(entry.columns).map(([columnKey, columnDef]) => ({
            key: columnKey,
            ...columnDef,
          })),
          ...Object.entries(dynamicColumns).map(([columnKey, columnDef]) => ({
            key: columnKey,
            dynamic: true,
            ...columnDef,
          })),
        ],
        relations: entry.relations
          ? Object.entries(entry.relations).map(([relKey, relDef]) => ({
              key: relKey,
              label: relDef.label,
              columns: Object.entries(relDef.columns).map(([columnKey, columnDef]) => ({
                key: `${relKey}.${columnKey}`,
                ...columnDef,
              })),
            }))
          : [],
      };
    }),
  );

// Infers a UI-facing type from the physical slot column's own name suffix
// (e.g. "cntc_column_number_3" -> "number") rather than needing the
// data_type id -> name lookup table customFieldFormService.js uses — the
// suffix is already embedded in reference_column_name, so this stays a
// pure string check, no extra query. Attachment slots are excluded (not a
// queryable/filterable value).
function inferCustomFieldType(referenceColumnName) {
  if (/_number_|_decimal_/.test(referenceColumnName)) return "number";
  if (/_date_and_time_|_date_/.test(referenceColumnName)) return "date";
  if (/_switch_|_dropdown_|_radio_/.test(referenceColumnName)) return "lookup";
  if (/_attechments_/.test(referenceColumnName)) return null; // not queryable
  return "string"; // text / text_area / default
}

// Per-company, per-module dynamic column whitelist — resolved fresh on
// every request (never cached across companies, never mutates
// MODEL_REGISTRY). Still a real whitelist: every column name/type comes
// from custom_field_form_masters rows scoped to this exact company, never
// from user input directly. Returns {} for a table with no
// customFieldFormType (the common case — most tables skip this entirely).
export async function resolveDynamicColumns(tenantDB, company_masters_id, formType) {
  if (!formType) return {};
  const CustomFieldForm = customFieldFormModel(tenantDB);
  const rows = await CustomFieldForm.findAll({
    where: { company_masters_id, form_type: formType, isDelete: 0 },
    attributes: ["reference_column_name", "title"],
    raw: true,
  });
  const columns = {};
  for (const row of rows) {
    const type = inferCustomFieldType(row.reference_column_name);
    if (!type) continue;
    columns[row.reference_column_name] = {
      label: row.title,
      type,
      filterable: true,
      sortable: false,
      groupable: type === "lookup",
      ...(type === "number" ? { aggregatable: ["sum", "avg", "min", "max"] } : {}),
    };
  }
  return columns;
}
