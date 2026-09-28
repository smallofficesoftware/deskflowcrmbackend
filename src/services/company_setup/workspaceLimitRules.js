// Pure workspace-limit rules (no DB) - see workspaceLimit.js for the plan lookup.

export const WORKSPACE_PAGE_SLUG = "workspaces";
export const DEFAULT_WORKSPACE_LIMIT = 1;

/** "5" -> 5, "1,00,000" -> 100000, "0" / "" / "abc" / null -> null (no limit). */
export const parseWorkspaceLimit = (raw) => {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/** { allowed, limit, used } - limit null = unlimited. */
export const decideWorkspaceCreate = ({ hasPlanEntry, rawDataLimit, used }) => {
  const limit = hasPlanEntry ? parseWorkspaceLimit(rawDataLimit) : DEFAULT_WORKSPACE_LIMIT;
  return { allowed: limit == null || used < limit, limit, used };
};
