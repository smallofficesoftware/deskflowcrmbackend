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
import { attendanceModel } from "../../models/hr/attendanceModel.js";
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
      // One-to-many self-relation — this contact's own id matched against
      // OTHER contacts' referance_contact (a real scalar INTEGER FK,
      // confirmed in contactModel.js — not CSV). Shallow: direct children
      // only, one level, matching the real shape confirmed by reading
      // chainContactReportService.js in full (it doesn't recurse deeper
      // either). child_count uses countOf instead of joining values.
      children: {
        label: "Referred Contacts",
        matchMode: "reverse",
        foreignKey: "id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "referance_contact",
        columns: {
          person_name: { label: "Child Names", type: "string" },
          child_count: { label: "Child Count", type: "number", countOf: true },
        },
      },
    },
    // Inbound filter — "contacts that have a matching row in another
    // table" (relations only go outbound: this row -> its lookup row).
    // Confirmed real shape in allContactReportServices.js: filters
    // cart_items by cart_type + item_product_id, collects distinct
    // contact_master_id, then WHERE id IN (...) on contacts. childFilters
    // are validated against cart_items' OWN already-registered column
    // whitelist below — not a duplicate list to maintain.
    inboundFilters: {
      hasOrderedProduct: {
        label: "Has Ordered Product",
        childModelKey: "cart_items",
        childForeignKey: "contact_master_id",
        parentKey: "id",
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
      // Plain scalar INTEGER (confirmed in cartItemsModel.js) — unlike
      // task_managements.status/contacts.lable, this one is a real FK, not
      // CSV, despite productSalesPurchaseServices.js defensively wrapping
      // it in FIND_IN_SET (which still matches a single int fine — not
      // evidence of real multi-value storage).
      item_product_id: { label: "Product", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Denormalized copy of the parent cart's type (confirmed in
      // cartItemsModel.js), same values as carts.type.
      cart_type: { label: "Order Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      item_qty: { label: "Quantity", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      item_rate: { label: "Rate", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      item_total: { label: "Total", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ...COUNT_COLUMN,
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
      // CSV-of-ids despite the TINYINT column type (confirmed in
      // teamAllTaskReportServices.js — real code does
      // FIND_IN_SET(${id}, status)/FIND_IN_SET(${id}, external_status), not
      // scalar equality). Corrected from an earlier wrong assumption based
      // on the schema type alone. Only "findInSet" is a valid operator.
      status: { label: "Status (internal)", type: "csv", filterable: true, sortable: false, groupable: false },
      external_status: { label: "Status (external)", type: "csv", filterable: true, sortable: false, groupable: false },
      // CSV-of-ids (confirmed in taskManagementModel.js). Only "findInSet"
      // is a valid operator; see queryEngine.js.
      label_id: { label: "Labels (has label)", type: "csv", filterable: true, sortable: false, groupable: false },
      // CSV-of-login-ids (confirmed TEXT column, and confirmed real usage —
      // teamAllTaskReportServices.js resolves it via FIND_IN_SET + per-id
      // getLoginDetailById calls). matchMode:"csv" + master-DB getModel are
      // both already-proven machinery (contacts.lable / carts.currency
      // respectively) — this relation needed no new engine code, just this
      // registration. Corrects an earlier wrong "needs a plugin" verdict on
      // this specific piece.
      assigned_team_member: { label: "Assigned To (has member)", type: "csv", filterable: true, sortable: false, groupable: false },
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
      assignedTeamMembers: {
        label: "Assigned To",
        matchMode: "csv",
        foreignKey: "assigned_team_member",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Assigned Names", type: "string" },
        },
      },
      status: {
        label: "Status (internal)",
        matchMode: "csv",
        foreignKey: "status",
        getModel: (tenantDB) => stagestatusModel(tenantDB),
        targetKey: "id",
        columns: {
          name: { label: "Status Names", type: "string" },
        },
      },
      externalStatus: {
        label: "Status (external)",
        matchMode: "csv",
        foreignKey: "external_status",
        getModel: (tenantDB) => stagestatusModel(tenantDB),
        targetKey: "id",
        columns: {
          name: { label: "External Status Names", type: "string" },
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
      product: {
        label: "Product",
        foreignKey: "product_id",
        getModel: (tenantDB) => productModel(tenantDB),
        targetKey: "id",
        // Reuses products' own column defs — not a duplicate definition.
        columns: { product_name: PRODUCT_COLUMNS.product_name },
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
          mobile_number: { label: "Mobile", type: "string" },
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
      // Confirmed real usage in reminderReportService.js: "future" reminders
      // are ones where this is null/empty — a plain nullable date column,
      // not a CSV/polymorphic field.
      completed_date_time: { label: "Completed Date", type: "date", filterable: true, sortable: true, groupable: false },
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
      createdBy: {
        label: "Created By",
        foreignKey: "a_application_login_id",
        // Pre-built instance bound to the MASTER db, same pattern as
        // expenses.employee/salary_registers.employee above.
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Created By", type: "string" },
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
      // Confirmed real column in expenseDetailedReportServices.js — the
      // approved/passed amount, separate from the claimed amount.
      pass_amount: { label: "Passed Amount", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
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
      total_present_day: { label: "Present Days", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      half_day: { label: "Half Days", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      total_leave: { label: "Leave Days", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      total_absent: { label: "Absent Days", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      working_hour: { label: "Working Hours", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ctc: { label: "CTC", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      gross_salary: { label: "Gross Salary", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
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
          recovery_mobile: { label: "Mobile", type: "string" },
          aadhar_card_number: { label: "Aadhar Number", type: "string" },
          pan_card_number: { label: "PAN Number", type: "string" },
        },
      },
    },
  },

  attendance: {
    label: "Attendance",
    getModel: (tenantDB) => attendanceModel(tenantDB),
    columns: {
      // 1=check-in, 2=check-out (confirmed in attendanceServices.js) — each
      // row is a punch event, not a daily present/absent summary.
      attendance_status: { label: "Punch Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      check_in_out_date_time: { label: "Punch Date/Time", type: "date", filterable: true, sortable: true, groupable: false },
      ...COUNT_COLUMN,
    },
    relations: {
      employee: {
        label: "Employee",
        foreignKey: "a_application_login_id",
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
  // A field belongs to this module if its OWN form_type matches, OR its
  // applicable_modules (a free-text CSV of extra form_type numbers) lists
  // it — the exact same two-part check every real caller uses
  // (miracleWebhookService.js, miracleService.js, orderServices.js). Fetch
  // broad (company-scoped, not form_type-filtered in SQL — applicable_modules
  // is free text, not safely matchable with a single indexed condition) and
  // filter in JS with the identical logic those callers already use, rather
  // than reinventing a narrower check that silently misses cross-module fields.
  // report_print_or_not: 1 — the same flag teamAllTaskReportServices.js
  // filters its own custom-field lookup by. A field a company owner never
  // marked "printable in reports" shouldn't surface in Report Builder's
  // picker either — same intent, applied generically instead of per-report.
  const allRows = await CustomFieldForm.findAll({
    where: { company_masters_id, isDelete: 0, report_print_or_not: 1 },
    attributes: ["reference_column_name", "title", "form_type", "applicable_modules"],
    raw: true,
  });
  const rows = allRows.filter((row) => {
    if (Number(row.form_type) === Number(formType)) return true;
    if (row.applicable_modules) {
      const mods = String(row.applicable_modules).split(",").map((m) => m.trim());
      return mods.includes(String(formType));
    }
    return false;
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
