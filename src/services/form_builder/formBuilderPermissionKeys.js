// Per-form permission keys (Form Builder v2 section 3/7 — rights are PER
// FORM, "Permissions" tab). Pure module: constants + grant validation, no
// DB, so it is unit-testable and the frontend can mirror the list.
//
// FORM_BUILDER page right (178) still gates building forms; these only
// grant extra powers on one form's entries. The company owner always has
// every one of them (formBuilderPermissions.js hasFormPermission).

export const FORM_PERMISSION_KEYS = [
  "change_dates", // pick dates on "Editable only by users with the right" date fields (C2)
  "override_auto_number", // type the auto number by hand (B6)
  "see_masked_fields", // reveal full value of masked / encrypted fields (O1/O8)
  "import_excel", // import entries from Excel (Q3)
  "manage_schedules", // set up recurring schedules (Q1)
  "edit_completed", // edit a completed / approved entry (I4) — enforced from Phase 8
  "convert", // convert an entry to Inquiry / Quotation / ... (J)
];

// Plain-words names for messages and the Permissions tab.
export const FORM_PERMISSION_LABELS = {
  change_dates: "Change form dates",
  override_auto_number: "Override auto number",
  see_masked_fields: "See hidden (masked) details",
  import_excel: "Import from Excel",
  manage_schedules: "Manage schedules",
  edit_completed: "Edit completed entries",
  convert: "Convert to Inquiry / Quotation",
};

const KEY_SET = new Set(FORM_PERMISSION_KEYS);

export function isValidPermissionKey(key) {
  return typeof key === "string" && KEY_SET.has(key);
}

function positiveInt(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : NaN;
}

// One grant / removal entry: { permission_key, a_application_login_id } or
// { permission_key, team_id } — exactly one target. Returns
// { value: { permission_key, a_application_login_id, team_id } } or { error }.
export function normalizePermissionEntry(entry) {
  if (!entry || typeof entry !== "object") return { error: "A permission entry couldn't be read." };
  if (!isValidPermissionKey(entry.permission_key)) {
    return { error: `Unknown permission "${entry.permission_key}".` };
  }
  const loginId = positiveInt(entry.a_application_login_id);
  const teamId = positiveInt(entry.team_id);
  if (Number.isNaN(loginId) || Number.isNaN(teamId)) {
    return { error: "Pick a user or a team from the list." };
  }
  if ((loginId == null) === (teamId == null)) {
    return { error: "Each permission must be given to either one user or one team." };
  }
  return {
    value: {
      permission_key: entry.permission_key,
      a_application_login_id: loginId,
      team_id: teamId,
    },
  };
}

// Validates { grants, removals } as sent to /form-builder/:id/permissions/save.
// Returns { grants, removals } (normalized, de-duplicated) or { error }.
export function normalizePermissionChanges({ grants, removals } = {}) {
  if (grants != null && !Array.isArray(grants)) return { error: "grants must be a list" };
  if (removals != null && !Array.isArray(removals)) return { error: "removals must be a list" };
  const out = { grants: [], removals: [] };
  for (const [name, list] of [
    ["grants", grants || []],
    ["removals", removals || []],
  ]) {
    const seen = new Set();
    for (const entry of list) {
      const result = normalizePermissionEntry(entry);
      if (result.error) return { error: result.error };
      const id = `${result.value.permission_key}|${result.value.a_application_login_id}|${result.value.team_id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out[name].push(result.value);
    }
  }
  return out;
}
