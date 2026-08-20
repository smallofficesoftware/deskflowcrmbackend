// Registers the existing, unmodified complex-report services under the same
// report_definitions/run system query-type reports use — proves the wrap-
// don't-rewrite approach works before Phase 3 migrates the remaining 23.
// Confirmed by reading both services directly (not assumed):
//
// - sourceReport(req) — 1-arg, resSuccess({data:{item: result}}) -> dataKey
//   "item". Calls getUserRights itself against PAGE_ID.SOURCE_REPORT.
// - productInventoryReport(req, res) — 2-arg (takes res too, unused
//   directly but harmless to pass through), resSuccess({data:{items,
//   totalRecords}}) -> dataKey "items". No getUserRights call at all — no
//   row-level rights beyond company/tenant scoping.
//
// hasOwnRightsCheck is metadata only, not something this module or
// queryEngine.js acts on — dispatch is pass-through, each service's
// existing rights behavior (or lack of it) is preserved exactly as-is.
import { productInventoryReport } from "../dashboard/Reports/productInventoryReportServices.js";
import { sourceReport } from "../dashboard/Reports/sourceReportServices.js";
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
  sourceWiseReport: {
    label: "Source-wise Report",
    fn: sourceReport,
    dataKey: "item",
    hasOwnRightsCheck: true,
    page_id: PAGE_ID.SOURCE_REPORT,
    filterSchema: [
      { key: "selected_dates", label: "Date Range", type: "date" },
      { key: "selectedSourceTypes", label: "Source Type", type: "lookup" },
      { key: "selectedTeamMembers", label: "Team Member", type: "lookup" },
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
