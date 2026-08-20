// Hardcoded whitelist — a report_definitions row's model_key/columns_json
// only ever gets resolved through this map, never used to reference an
// arbitrary table/column string. queryEngine.js is the only consumer.
//
// Never add company_masters_id / a_application_login_id / isDelete here —
// those are scope, injected by queryEngine.js after user filters, never
// something a report definition can filter/group on itself.
import { productModel } from "../../models/product_settings/productModel.js";

export const MODEL_REGISTRY = {
  products: {
    label: "Products",
    getModel: (tenantDB) => productModel(tenantDB),
    columns: {
      product_name: { label: "Product Name", type: "string", filterable: true, sortable: true, groupable: true },
      category_id: { label: "Category", type: "lookup", filterable: true, sortable: false, groupable: true },
      rate: { label: "Sale Rate", type: "currency", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      min_stock_quantity: { label: "Min Stock Qty", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["sum", "avg", "min", "max"] },
      created_date_time: { label: "Created Date", type: "date", filterable: true, sortable: true, groupable: false },
    },
  },
};

export const getRegisteredModel = (modelKey) => MODEL_REGISTRY[modelKey];

// Serializable view for the frontend's table/column picker — strips
// getModel (a function, not meaningful to a client) and reshapes into
// arrays the builder form can map over directly.
export const listModelRegistry = () =>
  Object.entries(MODEL_REGISTRY).map(([key, entry]) => ({
    key,
    label: entry.label,
    columns: Object.entries(entry.columns).map(([columnKey, columnDef]) => ({
      key: columnKey,
      ...columnDef,
    })),
  }));
