// Pure workspace-limit rules (no DB) - see workspaceLimit.js for the plan lookup.

export const WORKSPACE_PAGE_SLUG = "workspaces";
export const DEFAULT_WORKSPACE_LIMIT = 1;

/** "5" -> 5, "1,00,000" -> 100000, "0" / "" / "abc" / null -> null (no limit). */
export const parseWorkspaceLimit = (raw) => {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/**
 * Limit from the Workspaces page's per-user rights JSON (application_login_type_rights.a_page_id_rights_jason.limit),
 * the same value the contact check reads. Takes the parsed JSON objects of every user's row.
 *   number > 0 -> that limit (smallest across users, same outcome as the contact check's "any row reached it")
 *   null       -> a row carries limit 0 (plan says unlimited) and none carries a positive limit
 *   undefined  -> no usable limit ("" / missing: the plan has no Workspaces row) - caller falls back to the plan lookup
 */
export const pickRightsLimit = (rightsJsonList) => {
  let min;
  let sawZero = false;
  for (const json of rightsJsonList || []) {
    const raw = json?.limit;
    if (raw == null || String(raw).trim() === "") continue;
    const n = Number(String(raw).replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) continue;
    if (n === 0) sawZero = true;
    else min = min === undefined ? Math.floor(n) : Math.min(min, Math.floor(n));
  }
  if (min !== undefined) return min;
  return sawZero ? null : undefined;
};

/** { allowed, limit, used } - limit null = unlimited. rightsLimit (see pickRightsLimit) wins over the plan lookup when it is not undefined. */
export const decideWorkspaceCreate = ({ hasPlanEntry, rawDataLimit, used, rightsLimit }) => {
  const planBase = hasPlanEntry ? parseWorkspaceLimit(rawDataLimit) : DEFAULT_WORKSPACE_LIMIT;
  const limit = rightsLimit !== undefined ? rightsLimit : planBase;
  return { allowed: limit == null || used < limit, limit, used };
};
