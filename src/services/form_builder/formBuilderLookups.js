// Pure helpers for the Phase 5 lookup fields (plan items E and F): the
// extra Reference masters ("user" and company-made custom lists), the
// customer-lookup field's mapping, which fields are internal-only, and the
// publish-time checks for all of them. No DB, no imports — unit-tested in
// formBuilderLookups.test.js.
//
// Field props:
//   reference    master: "user" | "custom:<list id>" | <a CRM master key>
//   user         (no props)  — a team member of this company; stored as id
//   customer-lookup
//     lookup_map: { <contact column>: <form field key> }
//       e.g. { company_name: "company", mobile_number: "phone" } — the
//       chosen contact's details are copied into those form fields
//       (still editable). The field's own value is the contact id.

export const USER_MASTER = "user";
export const CUSTOM_MASTER_PREFIX = "custom:";

// Contact columns a customer-lookup field may copy into form fields, with
// the plain label shown in the editor.
export const CONTACT_LOOKUP_COLUMNS = {
  person_name: "Person name",
  company_name: "Company name",
  mobile_number: "Mobile number",
  email_id: "Email",
  city: "City",
  address: "Address",
  pincode: "Pincode",
  gst_number: "GST number",
};

// Form field types a contact detail can be copied into.
const MAP_TARGET_TYPES = new Set(["text", "textarea", "phone", "email", "address", "url"]);

export function isUserMaster(master) {
  return master === USER_MASTER;
}

export function customListIdOf(master) {
  if (typeof master !== "string" || !master.startsWith(CUSTOM_MASTER_PREFIX)) return null;
  const raw = master.slice(CUSTOM_MASTER_PREFIX.length);
  const id = Number(raw);
  return /^\d+$/.test(raw) && Number.isInteger(id) && id > 0 ? id : null;
}

export function isExtraMaster(master) {
  return isUserMaster(master) || (typeof master === "string" && master.startsWith(CUSTOM_MASTER_PREFIX));
}

// Fields that only ever exist on the internal form: team members and
// customer records are never offered to an anonymous visitor (plan E3, F5),
// whatever `visible_to` says.
export function isInternalOnlyField(field) {
  if (!field) return false;
  return (
    field.visible_to === "internal" ||
    field.type === "user" ||
    field.type === "customer-lookup" ||
    (field.type === "reference" && isUserMaster(field.master)) ||
    // A field restricted to certain staff (plan O8) is never asked of an anonymous visitor.
    (field.restriction != null && field.restriction !== "none")
  );
}

function nameOf(field) {
  return `“${field.label || field.key || "Untitled field"}”`;
}

// Publish check. `existingCustomListIds`: Set of live custom list ids (omit
// to skip the "list still exists" check, e.g. in unit tests).
// Returns a plain-words message, or null when everything is fine.
export function findLookupProblems(fields, { existingCustomListIds = null } = {}) {
  const list = Array.isArray(fields) ? fields.filter((f) => f && typeof f === "object") : [];
  const byKey = new Map(list.filter((f) => f.key).map((f) => [f.key, f]));

  for (const field of list) {
    if (field.type === "reference" && typeof field.master === "string" && field.master.startsWith(CUSTOM_MASTER_PREFIX)) {
      const id = customListIdOf(field.master);
      if (id == null) return `${nameOf(field)}: the list it uses couldn't be read. Pick the list again.`;
      if (existingCustomListIds && !existingCustomListIds.has(id)) {
        return `${nameOf(field)} uses a list that was deleted. Pick another list or create it again.`;
      }
    }

    if (field.type === "customer-lookup") {
      const map = field.lookup_map;
      if (map == null) continue;
      if (typeof map !== "object" || Array.isArray(map)) {
        return `${nameOf(field)}: the “fill these fields from the customer” settings couldn't be read. Set them again.`;
      }
      const used = new Set();
      for (const [column, targetKey] of Object.entries(map)) {
        if (targetKey == null || targetKey === "") continue;
        if (!CONTACT_LOOKUP_COLUMNS[column]) {
          return `${nameOf(field)}: “${column}” isn't a customer detail that can be copied. Remove it from the settings.`;
        }
        const target = byKey.get(targetKey);
        if (!target || target === field) {
          return `${nameOf(field)}: the field that should receive the customer's ${CONTACT_LOOKUP_COLUMNS[column].toLowerCase()} was deleted. Pick another field or clear it.`;
        }
        if (!MAP_TARGET_TYPES.has(target.type)) {
          return `${nameOf(field)}: ${nameOf(target)} can't receive the customer's ${CONTACT_LOOKUP_COLUMNS[column].toLowerCase()} — choose a text, phone, email or address field.`;
        }
        if (used.has(targetKey)) {
          return `${nameOf(field)}: ${nameOf(target)} is set to receive two different customer details. Give each detail its own field.`;
        }
        used.add(targetKey);
      }
    }
  }
  return null;
}
