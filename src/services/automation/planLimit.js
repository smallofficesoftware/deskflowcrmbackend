import { PLAN_PAGE_SLUG, RUNS_PER_ACTIVE_FLOW } from "./constants.js";

// Automations limit per plan, read from the SAME place as the contact limit:
// plan_vs_pages.data_limit for the "Workflow Automation" page (a_application_pages.page_slug =
// "workflow_automations"), edited on the existing Admin Panel -> Plans screen.
//
// data_limit is free text in the CRM's usual style: "5", "10,000", "1,00,000" (Indian grouping);
// "0" or empty means no limit (every page defaults to "0").

/**
 * Parse a plan data_limit into a number, or null for "no limit".
 * "5" -> 5, "10,000" -> 10000, "1,00,000" -> 100000, "0" / "" / "abc" / -3 / null -> null.
 */
export const parseDataLimit = (raw) => {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/** { max_active_flows, max_runs_per_month } from a plan's data_limit; runs scale with the flow limit. */
export const limitsFromDataLimit = (raw) => {
  const flows = parseDataLimit(raw);
  return flows == null
    ? { max_active_flows: null, max_runs_per_month: null }
    : { max_active_flows: flows, max_runs_per_month: flows * RUNS_PER_ACTIVE_FLOW };
};

/** Human text for messages / the Automations page. */
export const describeLimit = (n) => (n == null ? "unlimited" : String(n));

export { PLAN_PAGE_SLUG };
