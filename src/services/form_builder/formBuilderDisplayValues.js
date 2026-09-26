// How a saved value is shown outside the fill screens — in Excel and PDF
// (the submissions list uses its own enrichment): ids become readable
// labels, a question table becomes numbered lines, multi-select becomes a
// comma list. One place, so Excel and PDF never differ.
import { resolveMasterLabels } from "./formBuilderMasterRegistry.js";
import { resolveCustomerLabels } from "./formBuilderExtraMasters.js";
import { questionTableText } from "./formBuilderQuestionTable.js";

const LABELLED_TYPES = new Set(["reference", "user", "customer-lookup"]);

// { <field key>: { <id>: "label" } } for every Reference / Team member /
// Customer field among `fields`, resolved in one batch per field for all
// `rows` (never one query per row).
export async function buildLabelMaps({ tenantDB, fields, rows }) {
  const maps = {};
  for (const field of fields) {
    if (!LABELLED_TYPES.has(field.type)) continue;
    const ids = rows.map((r) => r[field.key]).filter((v) => v != null);
    if (field.type === "customer-lookup") maps[field.key] = await resolveCustomerLabels({ tenantDB, ids });
    else maps[field.key] = await resolveMasterLabels({ tenantDB, master: field.type === "user" ? "user" : field.master, ids });
  }
  return maps;
}

export function displayValueFor(field, value, labelMaps = {}) {
  if (value == null || value === "") return value;
  if (LABELLED_TYPES.has(field.type)) return labelMaps[field.key]?.[value] ?? value;
  if (field.type === "question-table") return questionTableText(field, value);
  if (field.type === "multi-select") {
    try {
      const list = JSON.parse(value);
      return Array.isArray(list) ? list.join(", ") : value;
    } catch {
      return value;
    }
  }
  return value;
}
