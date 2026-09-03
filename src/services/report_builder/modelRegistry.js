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
import { employeeAccountTransactionsModel } from "../../models/activities/employeeAccountTransactionModel.js";
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
import { targetVsIncentiveModel } from "../../models/hr/targetVsIncentiveModel.js";
import { accountOutstandingViewModel } from "../../models/report_builder/accountOutstandingViewModel.js";
import { employeeOutstandingViewModel } from "../../models/report_builder/employeeOutstandingViewModel.js";
import { stockLedgerViewModel } from "../../models/report_builder/stockLedgerViewModel.js";
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
  max_stock_quantity: { label: "Max Stock Qty", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
  purchase_rate: { label: "Purchase Rate", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
  purchase_net_rate: { label: "Purchase Net Rate", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
  created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
  // Real DB columns, previously unwhitelisted (found via a registry-vs-DB
  // diff) — GST/SKU-oriented product reports were impossible without these.
  product_code: { label: "Product Code", type: "string", filterable: true, sortable: true, groupable: false },
  hsn_code: { label: "HSN Code", type: "string", filterable: true, sortable: false, groupable: true },
  gst_id: { label: "GST", type: "lookup", filterable: true, sortable: false, groupable: true },
  net_rate: { label: "Net Rate", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
  unit_id: { label: "Unit", type: "lookup", filterable: true, sortable: false, groupable: true },
  product_barcode_number: { label: "Barcode", type: "string", filterable: true, sortable: false, groupable: false },
};

export const MODEL_REGISTRY = {
  products: {
    label: "Products",
    getModel: (tenantDB) => productModel(tenantDB),
    columns: PRODUCT_COLUMNS,
    // No slot 8 (Active/Deactivate) — no isActive-type column currently
    // registered in PRODUCT_COLUMNS, left unconfirmed rather than guessed.
    generalFilters: {
      1: "created_date_time",
      7: "category_id",
    },
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
      // Real scalar INTEGER FK (confirmed in contactModel.js — same column
      // the "children" reverse-relation below already matches against, just
      // exposed here as a plain filterable column too — e.g. "carts whose
      // customer is a referral of contact X" via a relation filter on
      // carts.customer, see categorySalesPurchaseServices.js's indirect
      // contact filter).
      referance_contact: { label: "Referred By (Contact)", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Real TINYINT flag (confirmed in contactModel.js) — allContactReportServices.js's
      // is_archive filter.
      is_archive: { label: "Archived", type: "lookup", filterable: true, sortable: false, groupable: true },
      a_application_login_id: { label: "Created By (Team Member)", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Real DB columns, previously unwhitelisted (found via a registry-vs-DB
      // diff) — commonly-wanted contact-export fields.
      email_id: { label: "Email", type: "string", filterable: true, sortable: false, groupable: false },
      gst_number: { label: "GST Number", type: "string", filterable: true, sortable: false, groupable: false },
      address: { label: "Address", type: "string", filterable: true, sortable: false, groupable: false },
      pincode: { label: "Pincode", type: "string", filterable: true, sortable: false, groupable: true },
      ...COUNT_COLUMN,
    },
    // Step 2 of the plan — which CheckBoxFilterModal.tsx slots apply to
    // this table, and which whitelisted column (above) each resolves to.
    // Slot legend: 1 Date Range, 2 Label, 3 Source Type, 4 Stage/Status,
    // 5/9 Team Member, 6 Demography, 18 Search Contact, 20 Unassign.
    // Operator per slot isn't fixed here — the run-time adapter reads
    // that target column's own `type` above (csv -> findInSet, lookup -> in).
    generalFilters: {
      1: "created_date_time",
      2: "lable",
      3: "source_type_id",
      4: "contact_status",
      5: "a_application_login_id",
      9: "a_application_login_id",
      6: true, // demography — country/state/city/area, all 4 already whitelisted above
      20: "a_application_login_id", // unassign — IS NULL, handled specially by the adapter
    },
    relations: {
      sourceType: {
        label: "Source Type",
        foreignKey: "source_type_id",
        getModel: (tenantDB) => sourceTypesModel(tenantDB),
        targetKey: "id",
        columns: {
          source_name: { label: "Source Name", type: "string" },
          color: { label: "Source Colour", type: "string" },
        },
      },
      status: {
        label: "Status",
        foreignKey: "contact_status",
        getModel: (tenantDB) => stagestatusModel(tenantDB),
        targetKey: "id",
        columns: {
          name: { label: "Status Name", type: "string" },
          color: { label: "Status Colour", type: "string" },
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
          color: { label: "Label Colours", type: "string" },
        },
      },
      // CSV-of-login-ids (confirmed real usage in allContactReportServices.js
      // — split + per-id getLoginDetailById lookup, same pattern as
      // task_managements.assignedTeamMembers). matchMode:"csv" + master-DB
      // getModel are both already-proven machinery, no new engine code.
      assignedTeamMembers: {
        label: "Assigned To",
        matchMode: "csv",
        foreignKey: "assinged_to_work_a_application_id",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Assigned Names", type: "string" },
        },
      },
      createdBy: {
        label: "Created By",
        foreignKey: "a_application_login_id",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Created By", type: "string" },
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
      // Real DB columns, previously unwhitelisted (found via a registry-vs-DB
      // diff) — several "Later" items in the plan (Discount Analysis, GST
      // Summary, Payment Due Forecast) turn out to just need these, not a
      // real limitation.
      due_date: { label: "Due Date", type: "date", filterable: true, sortable: true, groupable: false },
      discount_pct: { label: "Discount %", type: "number", filterable: true, sortable: false, groupable: false, aggregatable: ["avg", "min", "max"] },
      taxable_amt: { label: "Taxable Amount", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      gst_amt: { label: "GST Amount", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      payment_type: { label: "Payment Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      to_customer_email: { label: "Customer Email", type: "string", filterable: true, sortable: false, groupable: false },
      to_customer_phone: { label: "Customer Phone", type: "string", filterable: true, sortable: false, groupable: false },
      to_customer_gst_number: { label: "Customer GST Number", type: "string", filterable: true, sortable: false, groupable: false },
      ...COUNT_COLUMN,
    },
    // Trimmed from the earlier draft in the plan — no salesperson/series
    // column is actually registered on carts, so slots 5/9/15 don't apply
    // here despite seeming plausible. GST/payment_type ARE now registered
    // (above) but not wired into generalFilters below — cheap follow-up
    // if slot 22/25 turn out to be wanted on the run screen.
    generalFilters: {
      1: "cart_date",
      4: "cart_status",
      18: "to_customer_id",
    },
    relations: {
      customer: {
        label: "Customer",
        foreignKey: "to_customer_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        // No hand-listed columns — borrows contacts' own whitelist wholesale
        // via modelKey (see resolveRelationColumns in modelRegistry.js), so
        // adding a field to contacts.columns makes it available here too,
        // no edit needed in two places.
        modelKey: "contacts",
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
      // Plain scalar INTEGER (confirmed real data: int(11) NOT NULL, actual
      // rows hold single ids, not CSV — categorySalesPurchaseServices.js's
      // FIND_IN_SET usage is the same defensive-wrap-on-a-scalar pattern
      // already dismissed for item_product_id above, not evidence of real
      // multi-value storage; checked, not assumed).
      item_category_id: { label: "Category", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Denormalized copy of the parent cart's type (confirmed in
      // cartItemsModel.js), same values as carts.type.
      cart_type: { label: "Order Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      item_qty: { label: "Quantity", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      item_rate: { label: "Rate", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      item_total: { label: "Total", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      // Real DB columns, previously unwhitelisted (found via a registry-vs-DB
      // diff) — item-level GST/discount reports were impossible without these.
      item_hsn_code: { label: "HSN Code", type: "string", filterable: true, sortable: false, groupable: true },
      item_gst: { label: "GST %", type: "number", filterable: true, sortable: false, groupable: false, aggregatable: ["avg"] },
      item_discount_pct: { label: "Discount %", type: "number", filterable: true, sortable: false, groupable: false, aggregatable: ["avg", "min", "max"] },
      ...COUNT_COLUMN,
    },
    // No date column of its own (inherits the parent cart's) — no slot 1.
    generalFilters: {
      7: "item_category_id", // "Category / Product" — item_product_id covered by slot 19 below, both point at real whitelisted columns
      19: "item_product_id",
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
      task_fromdate: { label: "From Date", type: "date", filterable: true, sortable: true, groupable: false },
      task_enddate: { label: "Due Date", type: "date", filterable: true, sortable: true, groupable: false },
      created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
      // Real DB columns, previously unwhitelisted (found via a registry-vs-DB
      // diff) — no notes field or actual-completion-date was reportable before.
      task_remark: { label: "Remark", type: "string", filterable: true, sortable: false, groupable: false },
      completed_date: { label: "Completed Date", type: "date", filterable: true, sortable: true, groupable: false },
      // Real TINYINT flag (confirmed in taskManagementModel.js) —
      // teamAllTaskReportServices.js's is_support_ticket_flag filter.
      is_support_ticket: { label: "Is Support Ticket", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Real scalar INTEGER FK (confirmed in taskManagementModel.js),
      // already used as the `contact` relation's own foreignKey below —
      // added as its own whitelisted column for the same reason
      // inquiries.contact_master_id was: a relation foreignKey isn't
      // automatically filterable on its own, found while wiring Step 2's
      // general filters (slot 18).
      contact_masters_id: { label: "Contact", type: "lookup", filterable: true, sortable: false, groupable: true },
      ...COUNT_COLUMN,
    },
    // 12 (Show Only Template Task) doesn't apply — no "template" concept
    // exists anywhere in this table's registered columns, would need a new
    // column added to the registry first, not just a slot mapping. 1 picks
    // task_fromdate over task_enddate/created_date_time — the other two
    // are equally plausible candidates for "Date Range", not a hard rule.
    generalFilters: {
      1: "task_fromdate",
      2: "label_id",
      4: "status", // "external_status" covered separately by slot 21 below
      5: "assigned_team_member",
      9: "assigned_team_member",
      10: "assigned_team_member", // unassign — IS NULL/empty, handled specially by the adapter
      11: "task_type",
      18: "contact_masters_id",
      21: "external_status",
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
          task_color: { label: "Category Colour", type: "string" },
        },
      },
      // Widened to match carts.customer's field set (the richest existing
      // precedent) — was person_name/company_name only, thinner than
      // what's actually useful on a task report.
      contact: {
        label: "Contact",
        foreignKey: "contact_masters_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        modelKey: "contacts",
      },
      createdBy: {
        label: "Created By",
        foreignKey: "a_application_login_id",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Created By", type: "string" },
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
      // Widened to VARCHAR by migration 20260824200000 — an inquiry can now
      // reference multiple products, each with its own qty, via product_id/
      // qty/category_id as three POSITIONALLY-PAIRED comma-separated lists
      // (index N in one lines up with index N in the others; a single
      // product is just "5"). Not a plain number anymore — no longer
      // aggregatable/filterable as one (SUM on a CSV string would be wrong,
      // not just unsupported), display-only until a real "paired CSV
      // line-items" primitive exists (none does yet — a different shape
      // than the flat "tag" CSVs like contacts.lable, no engine support here).
      qty: { label: "Quantity (CSV)", type: "string", filterable: false, sortable: false, groupable: false },
      contact_status: { label: "Status", type: "lookup", filterable: true, sortable: false, groupable: true },
      source_type_id: { label: "Source Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Plain INTEGER FK (confirmed in inquiryModel.js — unlike contacts.lable
      // / task_managements.label_id, this one is scalar, not CSV).
      label_id: { label: "Label", type: "lookup", filterable: true, sortable: false, groupable: true },
      inquiry_date_time: { label: "Inquiry Date", type: "date", filterable: true, sortable: true, groupable: false },
      // Real scalar INTEGER FK (confirmed in inquiryModel.js), already used
      // as the `contact` relation's own foreignKey below — but relation
      // foreignKeys aren't automatically filterable columns in their own
      // right (queryEngine.js's filter builder only ever validates against
      // this whitelist, never a relation definition), so it needs its own
      // entry here too, found while wiring Step 2's general filters (slot
      // 18, Search Contact) — the plan's original registry-gap list missed
      // this one, only flagged attendance/visits/call_histories/reminder_messages.
      contact_master_id: { label: "Contact", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Real DB columns, previously unwhitelisted (found via a registry-vs-DB
      // diff). inquiry_assigned_team_member confirms the plan's own "Later:
      // Salesperson Inquiry Performance (no salesperson dimension)" was a
      // registry gap, not a real limitation — column exists, just never
      // registered. Same CSV-of-login-ids shape as task_managements.assigned_team_member.
      inquiry_assigned_team_member: { label: "Assigned To (has member)", type: "csv", filterable: true, sortable: false, groupable: false },
      product_remarks: { label: "Product Remarks", type: "string", filterable: true, sortable: false, groupable: false },
      ...COUNT_COLUMN,
    },
    generalFilters: {
      1: "inquiry_date_time",
      2: "label_id", // scalar, not csv — adapter uses op:"in", not findInSet
      3: "source_type_id",
      4: "contact_status",
      18: "contact_master_id",
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
        modelKey: "contacts",
      },
      // Both category_id and product_id are now CSV-of-ids (migrations
      // 20260824200000/210000 widened product_id/qty/category_id to VARCHAR
      // for multi-product inquiries) — matchMode:"csv" corrects the earlier
      // scalar-FK registration from before that schema change. Display only
      // joins/lists every matching name; the positional pairing with qty
      // (which product got which quantity) isn't reconstructable through a
      // plain CSV relation, same gap noted on the qty column above.
      category: {
        label: "Category",
        matchMode: "csv",
        foreignKey: "category_id",
        getModel: (tenantDB) => categoryModel(tenantDB),
        targetKey: "id",
        columns: {
          category_name: { label: "Category Name", type: "string" },
        },
      },
      product: {
        label: "Product",
        matchMode: "csv",
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
      // Real scalar INTEGER FK, already used as the `contact` relation's own
      // foreignKey below — added as its own whitelisted column, same
      // "relation foreignKey isn't automatically filterable" reasoning as
      // inquiries.contact_master_id, found while wiring Step 2.
      contact_masters_id: { label: "Contact", type: "lookup", filterable: true, sortable: false, groupable: true },
      ...COUNT_COLUMN,
    },
    // type: 1 = credit, 2 = debit (confirmed in accountReportServices.js:149-153).
    generalFilters: {
      1: "payment_date_time",
      13: "type", // Credit — adapter filters type=1
      14: "type", // Debit — adapter filters type=2
      18: "contact_masters_id",
      25: "mode",
    },
    relations: {
      contact: {
        label: "Contact",
        foreignKey: "contact_masters_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        modelKey: "contacts",
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
      // Pre-built instances bound to the MASTER db (a_application_logins
      // lives only in smalloffice/smalloffice_prod, never a tenant DB —
      // same pattern as expenses.employee/reminder_messages.createdBy
      // above). Confirmed real usage in accountReportServices.js's
      // getAllAccountTranstionsReport: both resolved per-row via
      // getLoginDetailById (N+1) — a single batched relation fetch here
      // replaces that.
      createdBy: {
        label: "Created By",
        foreignKey: "a_application_login_id",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Created By", type: "string" },
        },
      },
      approvedBy: {
        label: "Approved By",
        foreignKey: "approve_by_a_application_login_id",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Approved By", type: "string" },
        },
      },
    },
    // NOT whitelisted: reference_id/reference_table (polymorphic — the
    // target table varies per row, not a static FK a relation can point at).
  },

  // Backed by a SQL VIEW (account_outstanding_view, see alter.txt), same
  // recipe as stock_ledger — one row per APPROVED, non-deleted transaction,
  // with a pre-computed signed amount_signed (+ debit/type=2, - credit/
  // type=1) so SUM(amount_signed) grouped by contact IS the outstanding
  // balance directly (debit - credit, no separate per-row JS netting).
  // Replaces getAccountOutstandingReport's hand-rolled two-pass aggregation
  // (fetch all txns, net credit/debit in JS, then filter Payable/Receivable
  // in JS) with: group by contact, sum(amount_signed) as outstanding, a
  // having filter on the sign for the Payable/Receivable bucket.
  account_outstanding: {
    label: "Account Outstanding",
    getModel: (tenantDB) => accountOutstandingViewModel(tenantDB),
    columns: {
      contact_masters_id: { label: "Contact", type: "lookup", filterable: true, sortable: false, groupable: true },
      type: { label: "Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      amount: { label: "Amount", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      amount_signed: { label: "Signed Amount", type: "currency", filterable: false, sortable: false, groupable: false, aggregatable: ["sum"] },
      payment_date_time: { label: "Payment Date", type: "date", filterable: true, sortable: true, groupable: false },
      // Real DB columns, previously unwhitelisted (found via a registry-vs-DB
      // diff) — present on account_transactions already, were missing here.
      mode: { label: "Payment Mode", type: "lookup", filterable: true, sortable: false, groupable: true },
      remark: { label: "Remark", type: "string", filterable: true, sortable: false, groupable: false },
      ...COUNT_COLUMN,
    },
    generalFilters: {
      1: "payment_date_time",
      13: "type",
      14: "type",
      18: "contact_masters_id",
      25: "mode",
    },
    relations: {
      contact: {
        label: "Contact",
        foreignKey: "contact_masters_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        modelKey: "contacts",
      },
    },
  },

  // Same shape as account_transactions, dimensioned by team_id (a login,
  // not a contact) instead of contact_masters_id — confirmed identical
  // structure by reading employeeTransactionReportService.js's
  // getEmployeeAccountTranctionReport in full (createdBy/approvedBy
  // resolved per-row via getLoginDetailById, same N+1 pattern, same fix).
  employee_transactions: {
    label: "Employee Transactions",
    getModel: (tenantDB) => employeeAccountTransactionsModel(tenantDB),
    columns: {
      amount: { label: "Amount", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      type: { label: "Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      mode: { label: "Payment Mode", type: "lookup", filterable: true, sortable: false, groupable: true },
      payment_date_time: { label: "Payment Date", type: "date", filterable: true, sortable: true, groupable: false },
      remark: { label: "Remark", type: "string", filterable: true, sortable: false, groupable: false },
      ...COUNT_COLUMN,
    },
    generalFilters: {
      1: "payment_date_time",
      5: "team_id",
      9: "team_id",
      13: "type",
      14: "type",
      25: "mode",
    },
    relations: {
      employee: {
        label: "Employee",
        foreignKey: "team_id",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Employee", type: "string" },
          recovery_mobile: { label: "Mobile", type: "string" },
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
      createdBy: {
        label: "Created By",
        foreignKey: "a_application_login_id",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Created By", type: "string" },
        },
      },
      approvedBy: {
        label: "Approved By",
        foreignKey: "approve_by_a_application_login_id",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Approved By", type: "string" },
        },
      },
    },
  },

  // Backed by a SQL VIEW (employee_outstanding_view, see alter.txt) — same
  // recipe as account_outstanding, dimensioned by team_id instead of
  // contact_masters_id. Replaces getEmployeeAccountOutstandingReport's
  // identical hand-rolled netting logic.
  employee_outstanding: {
    label: "Employee Outstanding",
    getModel: (tenantDB) => employeeOutstandingViewModel(tenantDB),
    columns: {
      team_id: { label: "Employee", type: "lookup", filterable: true, sortable: false, groupable: true },
      type: { label: "Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      amount: { label: "Amount", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      amount_signed: { label: "Signed Amount", type: "currency", filterable: false, sortable: false, groupable: false, aggregatable: ["sum"] },
      payment_date_time: { label: "Payment Date", type: "date", filterable: true, sortable: true, groupable: false },
      // Real DB columns, previously unwhitelisted (found via a registry-vs-DB
      // diff) — present on account_transactions already, were missing here.
      mode: { label: "Payment Mode", type: "lookup", filterable: true, sortable: false, groupable: true },
      remark: { label: "Remark", type: "string", filterable: true, sortable: false, groupable: false },
      ...COUNT_COLUMN,
    },
    generalFilters: {
      1: "payment_date_time",
      5: "team_id",
      9: "team_id",
      13: "type",
      14: "type",
      25: "mode",
    },
    relations: {
      employee: {
        label: "Employee",
        foreignKey: "team_id",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Employee", type: "string" },
          recovery_mobile: { label: "Mobile", type: "string" },
        },
      },
    },
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
      // Real scalar INTEGER FK, already used as the `contact` relation's
      // own foreignKey below — added as its own whitelisted column, the
      // registry gap Step 2 originally flagged (found while wiring slot 18).
      contact_id: { label: "Contact", type: "lookup", filterable: true, sortable: false, groupable: true },
    },
    generalFilters: {
      1: "created_date_time",
      18: "contact_id",
    },
    relations: {
      contact: {
        label: "Contact",
        foreignKey: "contact_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        modelKey: "contacts",
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
      // Same registry-gap fix as visits.contact_id above.
      contact_id: { label: "Contact", type: "lookup", filterable: true, sortable: false, groupable: true },
      ...COUNT_COLUMN,
    },
    generalFilters: {
      1: "call_date_time",
      18: "contact_id",
    },
    relations: {
      contact: {
        label: "Contact",
        foreignKey: "contact_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        modelKey: "contacts",
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
      // Same registry-gap fix as visits/call_histories' contact_id above.
      contact_masters_id: { label: "Contact", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Real scalar INTEGER FK, already used as the `createdBy` relation's
      // own foreignKey below — added as its own whitelisted column for
      // slots 5/9 (Team Member), same reasoning as everywhere else here.
      a_application_login_id: { label: "Created By (Team Member)", type: "lookup", filterable: true, sortable: false, groupable: true },
      ...COUNT_COLUMN,
    },
    generalFilters: {
      1: "reminder_data_time",
      5: "a_application_login_id",
      9: "a_application_login_id",
      18: "contact_masters_id",
    },
    relations: {
      contact: {
        label: "Contact",
        foreignKey: "contact_masters_id",
        getModel: (tenantDB) => contactModel(tenantDB),
        targetKey: "id",
        modelKey: "contacts",
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
      // Real scalar INTEGER FK, already used as the `employee` relation's
      // own foreignKey below — added as its own whitelisted column for
      // slots 5/9 (Team Member).
      a_application_login_id: { label: "Employee", type: "lookup", filterable: true, sortable: false, groupable: true },
      ...COUNT_COLUMN,
    },
    generalFilters: {
      1: "expense_date",
      5: "a_application_login_id",
      9: "a_application_login_id",
      27: "expense_type_id",
      28: "expense_status",
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
      // Real scalar INTEGER FK, already used as the `employee` relation's
      // own foreignKey below — added as its own whitelisted column for
      // slots 5/9 (Team Member).
      employee_id: { label: "Employee", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Real DB columns, previously unwhitelisted (found via a registry-vs-DB
      // diff) — only summary totals (gross_salary/total_earning/total_deduction/
      // net_bank_pay above) were reportable before; no detailed payroll
      // breakdown was possible at all.
      basic_da: { label: "Basic + DA", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      hra: { label: "HRA", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      conveyance_allowance: { label: "Conveyance Allowance", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      medical_allowance: { label: "Medical Allowance", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      special_allowance: { label: "Special Allowance", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      per_day_salary: { label: "Per Day Salary", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      bonus_amount: { label: "Bonus", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      earn_sub_total: { label: "Earnings Sub-total", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      regular_ot_hours: { label: "Regular OT Hours", type: "number", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      extra_ot_hours: { label: "Extra OT Hours", type: "number", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      regular_ot_payable_amt: { label: "Regular OT Payable", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      extra_ot_payable_amt: { label: "Extra OT Payable", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ded_emp_pf: { label: "Employee PF", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ded_pradhan_mantri_pf: { label: "Pradhan Mantri PF", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ded_esi_employee: { label: "ESI (Employee)", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ded_esi_company: { label: "ESI (Company)", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ded_pt: { label: "Professional Tax", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ded_insurance: { label: "Insurance Deduction", type: "currency", filterable: true, sortable: false, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ...COUNT_COLUMN,
    },
    // No slot 1 (Date Range) — year/month are separate integers, not a
    // date-range column, doesn't fit that slot's shape at all (settled in
    // the plan: already covered by the static filter rows, no gap).
    generalFilters: {
      5: "employee_id",
      9: "employee_id",
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

  // Backed by a SQL VIEW (stock_ledger_view, see alter.txt), not a real
  // table — one row per stock-affecting cart_item, with a pre-computed
  // signed qty_delta (+ inward, - outward) so a running balance is a plain
  // ordered cumulative sum, not per-row JS business logic. Replaces the
  // sign-flip math productInventoryReportServices.js hand-rolls across 9
  // separate queries; that plugin also has a real bug fixed here (its
  // opening-balance query doesn't apply the reference_type exclusion its
  // closing-balance query does — this view applies it consistently to both,
  // so opening-stock figures will differ slightly from the old plugin
  // wherever a purchase/sales row has a linked inward/dispatch duplicate).
  stock_ledger: {
    label: "Stock Ledger",
    getModel: (tenantDB) => stockLedgerViewModel(tenantDB),
    columns: {
      item_product_id: { label: "Product", type: "lookup", filterable: true, sortable: false, groupable: true },
      cart_type: { label: "Movement Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      cart_date: { label: "Movement Date", type: "date", filterable: true, sortable: true, groupable: false },
      item_qty: { label: "Quantity (unsigned)", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      // Signed movement — +item_qty for inward (purchase/inward/return-
      // sales/stock-adjustment-in), -item_qty for outward (sales/dispatch/
      // return-purchase/stock-adjustment-out), computed once in the view.
      // aggregatable:["sum"] gives a plain period total; runningTotal gives
      // a cumulative per-product balance over ordered rows (see
      // queryEngine.js's runningTotalSpec — JS accumulation over rows
      // fetched pre-sorted by cart_date, not a SQL window function).
      qty_delta: {
        label: "Stock Movement (signed)",
        type: "number",
        filterable: false,
        sortable: false,
        groupable: false,
        aggregatable: ["sum"],
        runningTotal: { partitionBy: "item_product_id", orderBy: "cart_date" },
      },
      stock_type: { label: "Stock Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Real column, previously unwhitelisted (found via registry-vs-DB
      // diff) — no per-warehouse breakdown was possible before.
      item_warehouse_id: { label: "Warehouse", type: "lookup", filterable: true, sortable: false, groupable: true },
      ...COUNT_COLUMN,
    },
    // Category not directly on this table — product-only for slot 7.
    generalFilters: {
      1: "cart_date",
      7: "item_product_id",
      16: "item_warehouse_id",
      17: "stock_type",
    },
    relations: {
      product: {
        label: "Product",
        foreignKey: "item_product_id",
        getModel: (tenantDB) => productModel(tenantDB),
        targetKey: "id",
        columns: {
          product_name: PRODUCT_COLUMNS.product_name,
          min_stock_quantity: PRODUCT_COLUMNS.min_stock_quantity,
          max_stock_quantity: PRODUCT_COLUMNS.max_stock_quantity,
          purchase_rate: PRODUCT_COLUMNS.purchase_rate,
          purchase_net_rate: PRODUCT_COLUMNS.purchase_net_rate,
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
      // Real scalar INTEGER FK, already used as the `employee` relation's
      // own foreignKey below — added as its own whitelisted column for
      // slots 5/9 (Team Member) — the 4th of the registry gaps the plan
      // doc originally flagged.
      a_application_login_id: { label: "Employee", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Real column, previously unwhitelisted (found via registry-vs-DB
      // diff) — total hours worked per punch pair.
      total_working_hour: { label: "Total Working Hours", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      ...COUNT_COLUMN,
    },
    generalFilters: {
      1: "check_in_out_date_time",
      5: "a_application_login_id",
      9: "a_application_login_id",
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

  // Confirmed real columns in targetVsIncentiveModel.js — assigned_team_member
  // is the dimension targetIncentiveReportServices.js groups by. Registered
  // both as a plain query-type source (a flat listing of target records) and
  // so metricsRegistry.js's target-side metrics (below) can reuse this same
  // whitelist via modelKey, same "no second whitelist" reasoning as everywhere
  // else here.
  target_vs_incentives: {
    label: "Targets & Incentives",
    getModel: (tenantDB) => targetVsIncentiveModel(tenantDB),
    columns: {
      assigned_team_member: { label: "Team Member", type: "lookup", filterable: true, sortable: false, groupable: true },
      target_type: { label: "Target Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      target_fromdate: { label: "Target From", type: "date", filterable: true, sortable: true, groupable: false },
      target_todate: { label: "Target To", type: "date", filterable: true, sortable: true, groupable: false },
      target_count: { label: "Target Count", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      target_value: { label: "Target Value", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      incentive_type: { label: "Incentive Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      incentive_value: { label: "Incentive Value", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      // Real column, previously unwhitelisted (found via registry-vs-DB
      // diff) — lets a target/incentive row be scoped to one product.
      product_id: { label: "Product", type: "lookup", filterable: true, sortable: false, groupable: true },
      ...COUNT_COLUMN,
    },
    // Two date columns (target_fromdate/target_todate) — target_fromdate
    // picked for slot 1, same "equally plausible, pick one" call as
    // task_managements' own Date Range ambiguity.
    generalFilters: {
      1: "target_fromdate",
      5: "assigned_team_member",
      9: "assigned_team_member",
      7: "product_id",
    },
    relations: {
      employee: {
        label: "Team Member",
        foreignKey: "assigned_team_member",
        getModel: () => loginModel,
        targetKey: "id",
        columns: {
          username: { label: "Team Member", type: "string" },
        },
      },
      product: {
        label: "Product",
        foreignKey: "product_id",
        getModel: (tenantDB) => productModel(tenantDB),
        targetKey: "id",
        columns: {
          product_name: PRODUCT_COLUMNS.product_name,
        },
      },
    },
  },
};

export const getRegisteredModel = (modelKey) => MODEL_REGISTRY[modelKey];

// A relation's displayable columns — either its own hand-curated `columns`
// map, or (when it declares `modelKey` instead) borrowed straight from that
// already-registered table's own `columns`. This is what lets e.g. every
// `contact` relation across task_managements/inquiries/visits/... just say
// `modelKey: "contacts"` once instead of re-listing person_name/company_name/
// mobile_number/... in every table that has a contact FK — one source of
// truth, no per-relation field list to keep in sync by hand.
export const resolveRelationColumns = (relDef) => relDef.columns || (relDef.modelKey && MODEL_REGISTRY[relDef.modelKey]?.columns) || {};

// A relation's OWN relations, one hop further out — only available when the
// relation is modelKey-backed (a hand-curated `columns`-only relation has no
// registry entry to borrow a `relations` map from). This is what makes
// task -> contact -> label chaining "just work" once `contact` points at
// `modelKey: "contacts"`: contacts' own already-registered `label` relation
// becomes reachable as "contact.label.lable_name" for free, no new field
// list anywhere — queryEngine.js resolves it as one more batched fetch.
export const resolveRelationRelations = (relDef) => (relDef.modelKey && MODEL_REGISTRY[relDef.modelKey]?.relations) || null;

// Lightweight, non-PIN-safe slice of a table's registry entry — the
// generalFilters slot map + each target column's `type` (needed to pick
// findInSet vs in on the frontend adapter, see generalFilterAdapter.ts),
// plus every column's own filterable/type/label (needed for the run
// screen's row-level per-column filters, so it can only offer a filter
// on a column queryEngine.js will actually accept — it throws hard on a
// non-filterable one, e.g. any aggregate alias or relation-dotted key).
// Deliberately still excludes relations, groupable/aggregatable flags,
// and dynamic custom-field columns (those need company context this
// endpoint doesn't take) — those stay behind getModelRegistry's PIN
// gate since they're build-surface, not needed to just run a report.
export const getGeneralFilterMeta = (modelKey) => {
  const entry = MODEL_REGISTRY[modelKey];
  if (!entry) return null;
  const generalFilters = entry.generalFilters || {};
  const columnTypes = {};
  for (const target of Object.values(generalFilters)) {
    if (typeof target === "string" && entry.columns[target]) {
      columnTypes[target] = entry.columns[target].type;
    }
  }
  const filterableColumns = {};
  for (const [key, def] of Object.entries(entry.columns)) {
    if (def.filterable) {
      filterableColumns[key] = { type: def.type, label: def.label };
    }
  }
  return { generalFilters, columnTypes, filterableColumns };
};

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
          ? Object.entries(entry.relations).map(([relKey, relDef]) => {
              const relColumns = resolveRelationColumns(relDef);
              const subRelations = !relDef.matchMode ? resolveRelationRelations(relDef) : null;
              return {
                key: relKey,
                label: relDef.label,
                columns: Object.entries(relColumns).map(([columnKey, columnDef]) => ({
                  key: `${relKey}.${columnKey}`,
                  ...columnDef,
                })),
                // Second hop — only reachable when this relation borrows a
                // full registry entry (modelKey) AND is itself a plain scalar
                // relation (chaining off a csv/reverse relation isn't
                // supported, same restriction queryEngine.js enforces). Lets
                // the frontend render e.g. "Contact > Labels > Label Names"
                // as its own pickable leaf without either table listing it
                // by hand.
                relations: subRelations
                  ? Object.entries(subRelations).map(([subRelKey, subRelDef]) => ({
                      key: `${relKey}.${subRelKey}`,
                      label: subRelDef.label,
                      columns: Object.entries(resolveRelationColumns(subRelDef)).map(([columnKey, columnDef]) => ({
                        key: `${relKey}.${subRelKey}.${columnKey}`,
                        ...columnDef,
                      })),
                    }))
                  : [],
              };
            })
          : [],
        // Step 2 of the plan — which CheckBoxFilterModal.tsx slot numbers
        // apply to this table and which whitelisted column (or `true` for
        // slot 6, Demography) each resolves to. {} for a table with none
        // registered yet, same "always an object, never undefined" shape
        // dynamicColumns already has.
        generalFilters: entry.generalFilters || {},
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
