// Pure workspace-limit rules (no DB) - see workspaceLimit.js for the plan lookup.

export const WORKSPACE_PAGE_SLUG = "workspaces";
export const DEFAULT_WORKSPACE_LIMIT = 1;

/** "5" -> 5, "1,00,000" -> 100000, "0" / "" / "abc" / null -> null (no limit). */
export const parseWorkspaceLimit = (raw) => {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/** { allowed, limit, used } - limit null = unlimited. extraWorkspaces = quantity bought as Admin Panel add-ons; ignored when the plan is unlimited. */
export const decideWorkspaceCreate = ({ hasPlanEntry, rawDataLimit, used, extraWorkspaces = 0 }) => {
  const base = hasPlanEntry ? parseWorkspaceLimit(rawDataLimit) : DEFAULT_WORKSPACE_LIMIT;
  const extra = Number.isFinite(Number(extraWorkspaces)) && Number(extraWorkspaces) > 0 ? Math.floor(Number(extraWorkspaces)) : 0;
  const limit = base == null ? null : base + extra;
  return { allowed: limit == null || used < limit, limit, used };
};
