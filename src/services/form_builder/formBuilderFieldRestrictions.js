// Role-based field restrictions (plan item O8): a field can be locked so that
// only people with the form's "See restricted fields" permission
// (permission key see_masked_fields, set per form on the Permissions tab) get
// the full field. Everyone else gets, by the field's `restriction` prop:
//
//   "readonly"  the answer is visible but they can't change it
//   "mask"      the answer shows as •••• (list, entry, Excel, PDF) and can't be changed
//   "hide"      the field is left out completely
//   "none"      (default) no restriction
//
// Restricted fields are never asked on a public form, whatever the mode
// (see isInternalOnlyField). Only top-level fields can be restricted.
// The pure functions here are unit-tested in formBuilderFieldRestrictions.test.js;
// resolveRestrictions is the small DB-side wrapper.

import { hasFormPermission } from "./formBuilderPermissions.js";

export const RESTRICTION_MODES = ["none", "readonly", "mask", "hide"];
export const MASK_TEXT = "••••";

export function restrictionOf(field) {
  return RESTRICTION_MODES.includes(field?.restriction) ? field.restriction : "none";
}

export const isRestricted = (field) => restrictionOf(field) !== "none";

// What this user may not fully see / change. `canSeeRestricted` = owner or
// holder of the see_masked_fields permission — then nothing is restricted.
export function computeRestrictions(fields, canSeeRestricted) {
  const out = { hidden: [], masked: [], readonly: [] };
  if (canSeeRestricted) return out;
  for (const f of Array.isArray(fields) ? fields : []) {
    if (!f || !f.key) continue;
    const mode = restrictionOf(f);
    if (mode === "hide") out.hidden.push(f.key);
    else if (mode === "mask") out.masked.push(f.key);
    else if (mode === "readonly") out.readonly.push(f.key);
  }
  return out;
}

// Keys this user may not write: a create leaves them empty, an edit keeps
// the stored value.
export function writeLockedKeys(restrictions) {
  return new Set([...(restrictions?.hidden || []), ...(restrictions?.masked || []), ...(restrictions?.readonly || [])]);
}

// A copy of a saved row (raw table row, or one enriched by the submission
// service with _reference_labels / _repeaters / _files) with the restricted
// answers removed or masked.
export function applyReadRestrictions(row, restrictions) {
  if (!row || !restrictions) return row;
  const hidden = new Set(restrictions.hidden || []);
  const masked = new Set(restrictions.masked || []);
  if (hidden.size === 0 && masked.size === 0) return row;

  const out = { ...row };
  for (const key of hidden) {
    delete out[key];
    if (out._reference_labels) out._reference_labels = omit(out._reference_labels, key);
    if (out._repeaters) out._repeaters = omit(out._repeaters, key);
  }
  for (const key of masked) {
    if (key in out) out[key] = out[key] == null || out[key] === "" ? out[key] : MASK_TEXT;
    if (out._reference_labels && key in out._reference_labels) {
      out._reference_labels = { ...out._reference_labels, [key]: out._reference_labels[key] == null ? null : MASK_TEXT };
    }
    if (out._repeaters && key in out._repeaters) out._repeaters = { ...out._repeaters, [key]: [] };
  }
  if (Array.isArray(out._files)) {
    out._files = out._files.filter((f) => !hidden.has(f.field_key) && !masked.has(f.field_key));
  }
  return out;
}

function omit(obj, key) {
  const { [key]: _removed, ...rest } = obj;
  return rest;
}

// Fields for Excel / PDF columns: hidden ones are left out entirely (masked
// ones stay, their values already read ••••).
export function fieldsForExport(fields, restrictions) {
  const hidden = new Set(restrictions?.hidden || []);
  return fields.filter((f) => !hidden.has(f.key));
}

// Publish check: returns a plain-words message or null.
export function findRestrictionProblems(fields) {
  for (const f of Array.isArray(fields) ? fields : []) {
    if (!f || f.restriction == null) continue;
    const name = `“${f.label || f.key}”`;
    if (!RESTRICTION_MODES.includes(f.restriction)) return `${name}: choose who may see or change this field (everyone, read-only, hidden as •••• or hidden).`;
    if (f.restriction !== "none" && (f.type === "section-header" || f.type === "instruction")) {
      return `${name}: a heading or note can't be restricted. Restrict the fields under it instead.`;
    }
  }
  return null;
}

// The user's restrictions on this form (owner and see_masked_fields holders: none).
export async function resolveRestrictions({ form, fields, loginId, company_masters_id, tenantDB }) {
  if (!fields.some(isRestricted)) return { hidden: [], masked: [], readonly: [] };
  const canSee = await hasFormPermission({ form, permissionKey: "see_masked_fields", loginId, company_masters_id, tenantDB });
  return computeRestrictions(fields, canSee);
}
