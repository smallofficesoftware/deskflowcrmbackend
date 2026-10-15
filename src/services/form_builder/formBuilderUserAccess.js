// Per-user field access: a field can carry `user_access`, a list of
//   { user_id: <a_application_login_id>, see: boolean, edit: boolean }
// which replaces the older "Who sees this field" / restriction dropdowns.
//
// Rules for a field that HAS a list (non-empty):
//   * a user who is not in the list, or has see = false  -> the field is hidden
//   * see = true, edit = false                           -> visible, read-only
//   * see = true, edit = true                            -> full access
// The form owner and holders of the form's "See restricted fields" permission
// are never limited (handled by the caller, as for the old restriction).
// A field with no list keeps the old `restriction` behavior unchanged.
//
// Whether the field is on the PUBLIC link is its own toggle (visible_to), not
// part of this list - an anonymous visitor has no user id to list.
//
// Pure functions only (unit-tested in formBuilderUserAccess.test.js).

export function hasUserAccess(field) {
  return Array.isArray(field?.user_access) && field.user_access.length > 0;
}

// The list entry for one login, or null.
export function userAccessEntry(field, loginId) {
  if (!hasUserAccess(field) || loginId == null) return null;
  const id = Number(loginId);
  return field.user_access.find((e) => e && Number(e.user_id) === id) || null;
}

// What a user gets on a field with a list: "hide" | "readonly" | "none".
export function userAccessModeFor(field, loginId) {
  const entry = userAccessEntry(field, loginId);
  if (!entry || entry.see !== true) return "hide";
  if (entry.edit !== true) return "readonly";
  return "none";
}

// Publish check: a plain-words message or null.
export function findUserAccessProblems(fields) {
  for (const f of Array.isArray(fields) ? fields : []) {
    if (!f || f.user_access == null) continue;
    const name = `“${f.label || f.key}”`;
    if (!Array.isArray(f.user_access)) return `${name}: the list of people who may see or edit this field couldn't be read. Set it again.`;
    if (f.user_access.length > 0 && (f.type === "section-header" || f.type === "instruction")) {
      return `${name}: a heading or note can't be limited to people. Limit the fields under it instead.`;
    }
    const seen = new Set();
    for (const e of f.user_access) {
      const id = Number(e?.user_id);
      if (!Number.isInteger(id) || id <= 0) return `${name}: one of the people in the access list is not valid. Set it again.`;
      if (seen.has(id)) return `${name}: the same person is listed twice in the access list.`;
      seen.add(id);
      if (e.edit === true && e.see !== true) return `${name}: a person who can edit this field must also be able to see it.`;
    }
  }
  return null;
}
