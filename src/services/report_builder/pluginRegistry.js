// Registers the existing, unmodified complex-report services under the same
// report_definitions/run system query-type reports use — proves the wrap-
// don't-rewrite approach works for reports that genuinely need it.
//
// sourceWiseReport was removed from here: it was just contacts/inquiries
// COUNT-grouped by source_type_id, no real business logic beyond that — now
// buildable as a plain query-type report against `contacts`/`inquiries`
// (source_type_id is a groupable base column, sourceType is a whitelisted
// relation for the display name — see modelRegistry.js). sourceReportServices.js
// itself is untouched; only the plugin-registry wrapper was removed, since
// query-type coverage replaces the need for it.
//
// - productInventoryReport(req, res) — 2-arg (takes res too, unused
//   directly but harmless to pass through), resSuccess({data:{items,
//   totalRecords}}) -> dataKey "items". No getUserRights call at all — no
//   row-level rights beyond company/tenant scoping. Stays a plugin: real
//   stock in/out math, not just stored data.
//
// hasOwnRightsCheck is metadata only, not something this module or
// queryEngine.js acts on — dispatch is pass-through, each service's
// existing rights behavior (or lack of it) is preserved exactly as-is.
import { productInventoryReport } from "../dashboard/Reports/productInventoryReportServices.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";

export const PLUGIN_REGISTRY = {
  productInventoryReport: {
    label: "Product Inventory Report",
    fn: productInventoryReport,
    dataKey: "items",
    hasOwnRightsCheck: false,
    page_id: PAGE_ID.PRODUCTINVENTORY_REPORT,
    filterSchema: [
      { key: "selectedDates", label: "Date Range", type: "date" },
      { key: "selectedProduct", label: "Product", type: "lookup" },
      { key: "selectedCategory", label: "Category", type: "lookup" },
      { key: "selectedStockTypeId", label: "Stock Type", type: "lookup" },
      { key: "selectedWarehouseIds", label: "Warehouse", type: "lookup" },
    ],
  },
};

export const getRegisteredPlugin = (pluginKey) => PLUGIN_REGISTRY[pluginKey];

export const listPluginRegistry = () =>
  Object.entries(PLUGIN_REGISTRY).map(([key, p]) => ({
    key,
    label: p.label,
    filterSchema: p.filterSchema,
  }));
