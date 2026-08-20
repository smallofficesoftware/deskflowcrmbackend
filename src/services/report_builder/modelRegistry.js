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
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import currencyModel from "../../models/configuration/currencyModel.js";
import { sourceTypesModel } from "../../models/masters/sourceTypeMode.js";
import { taskCategoryModel } from "../../models/masters/taskCategoryModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productModel } from "../../models/product_settings/productModel.js";

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
    columns: {
      person_name: { label: "Contact Name", type: "string", filterable: true, sortable: true, groupable: false },
      company_name: { label: "Company Name", type: "string", filterable: true, sortable: true, groupable: true },
      mobile_number: { label: "Mobile", type: "string", filterable: true, sortable: false, groupable: false },
      contact_status: { label: "Status", type: "lookup", filterable: true, sortable: false, groupable: true },
      // Already plain display strings on the row itself, not FK ids — no
      // relation needed (confirmed by reading contactModel.js in full).
      country: { label: "Country", type: "string", filterable: true, sortable: false, groupable: true },
      state: { label: "State", type: "string", filterable: true, sortable: false, groupable: true },
      city: { label: "City", type: "string", filterable: true, sortable: false, groupable: true },
      area: { label: "Area", type: "string", filterable: true, sortable: false, groupable: true },
      created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
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
      grand_total: { label: "Grand Total", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
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
    columns: {
      task_title: { label: "Task Title", type: "string", filterable: true, sortable: true, groupable: false },
      task_priority: { label: "Priority", type: "lookup", filterable: true, sortable: false, groupable: true },
      task_type: { label: "Task Type", type: "lookup", filterable: true, sortable: false, groupable: true },
      task_enddate: { label: "Due Date", type: "date", filterable: true, sortable: true, groupable: false },
      created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
    },
    relations: {
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
    columns: {
      description: { label: "Description", type: "string", filterable: true, sortable: false, groupable: false },
      qty: { label: "Quantity", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      contact_status: { label: "Status", type: "lookup", filterable: true, sortable: false, groupable: true },
      inquiry_date_time: { label: "Inquiry Date", type: "date", filterable: true, sortable: true, groupable: false },
    },
    relations: {
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
export const listModelRegistry = () =>
  Object.entries(MODEL_REGISTRY).map(([key, entry]) => ({
    key,
    label: entry.label,
    columns: Object.entries(entry.columns).map(([columnKey, columnDef]) => ({
      key: columnKey,
      ...columnDef,
    })),
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
  }));
