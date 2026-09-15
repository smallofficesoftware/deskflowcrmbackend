// Two small registries used by the Reference field type (plan §1) and by
// related_module linkage (plan §4): where to look up a master record's
// display label, and how a reference field cascades to its parent. Kept as
// plain data + a couple of batched-lookup helpers — not a bespoke query
// builder per master, so adding another master later (e.g. Contact Source,
// Tax) is one registry entry, not new field-type code.
//
// Every table/column name below is verified against the real model files
// (see plan §1/§4's "verified" notes), not guessed.
import { QueryTypes } from "sequelize";

// master key -> { table, label, parentColumn? }
// parentColumn is present only for masters that cascade from another
// reference field (state<-country, city<-state, product<-category).
export const MASTER_REGISTRY = {
  country: { table: "a_countries", label: "country_name" },
  state: { table: "a_states", label: "state_name", parentColumn: "country_id" },
  city: { table: "a_cities", label: "city_name", parentColumn: "state_id" },
  category: { table: "categories", label: "category_name" },
  product: { table: "products", label: "product_name", parentColumn: "category_id" },
};

// related_module -> table, for the related_record_id existence-check and
// display-label resolution (plan §4). "order" -> "carts" is the one that
// isn't obvious from the name alone (verified against orderServices.js).
export const RELATED_MODULE_REGISTRY = {
  contact: { table: "contact_masters", label: "person_name" },
  product: { table: "products", label: "product_name" },
  inquiry: { table: "inquiries", label: "name" },
  order: { table: "carts", label: "cart_number" },
};

// Live options for a reference field's dropdown (plan §1's
// /reference-options endpoint, both internal and public variants). Not
// cached/baked into schema_json — master data changes over time.
export async function getReferenceOptions({ tenantDB, master, parentId }) {
  const entry = MASTER_REGISTRY[master];
  if (!entry) {
    throw new Error(`formBuilderMasterRegistry: unknown master "${master}"`);
  }

  const where = { isDelete: 0 };
  if (entry.parentColumn) {
    if (parentId == null) return [];
    where[entry.parentColumn] = parentId;
  }

  const rows = await tenantDB.query(
    `SELECT id, \`${entry.label}\` AS label FROM \`${entry.table}\` WHERE isDelete = 0${
      entry.parentColumn ? ` AND \`${entry.parentColumn}\` = :parentId` : ""
    } ORDER BY \`${entry.label}\` ASC`,
    {
      replacements: entry.parentColumn ? { parentId } : {},
      type: QueryTypes.SELECT,
    },
  );
  return rows;
}

// Batched id -> label resolution for a set of reference-field ids against
// one master, used by the submissions list and PDF/Excel export paths
// (plan §1's "Display-side gap" fix) — one query per distinct master, never
// one query per row. Soft-deleted rows fall back to "(deleted)" rather than
// a blank label.
export async function resolveMasterLabels({ tenantDB, master, ids }) {
  const uniqueIds = [...new Set((ids || []).filter((id) => id != null))];
  if (uniqueIds.length === 0) return {};

  const registryEntry = MASTER_REGISTRY[master];
  if (!registryEntry) {
    throw new Error(`formBuilderMasterRegistry: unknown master "${master}"`);
  }

  const rows = await tenantDB.query(
    `SELECT id, \`${registryEntry.label}\` AS label, isDelete FROM \`${registryEntry.table}\` WHERE id IN (:ids)`,
    { replacements: { ids: uniqueIds }, type: tenantDB.QueryTypes.SELECT },
  );

  const map = {};
  for (const id of uniqueIds) map[id] = "(deleted)";
  for (const row of rows) {
    map[row.id] = row.isDelete ? "(deleted)" : row.label;
  }
  return map;
}

// Same batched id->label idea, for related_module/related_record_id
// display (plan §1's "Same batching principle applies to related_module/
// related_record_id display" note).
export async function resolveRelatedRecordLabels({ tenantDB, relatedModule, ids }) {
  const uniqueIds = [...new Set((ids || []).filter((id) => id != null))];
  if (uniqueIds.length === 0) return {};

  const entry = RELATED_MODULE_REGISTRY[relatedModule];
  if (!entry) return {};

  const rows = await tenantDB.query(
    `SELECT id, \`${entry.label}\` AS label, isDelete FROM \`${entry.table}\` WHERE id IN (:ids)`,
    { replacements: { ids: uniqueIds }, type: tenantDB.QueryTypes.SELECT },
  );

  const map = {};
  for (const id of uniqueIds) map[id] = "(deleted)";
  for (const row of rows) {
    map[row.id] = row.isDelete ? "(deleted)" : row.label;
  }
  return map;
}

// Existence check for related_record_id (plan §4: "verifies the given
// related_record_id actually exists (and isn't soft-deleted)") — the
// server never trusts a picker's offer alone.
export async function relatedRecordExists({ tenantDB, relatedModule, recordId }) {
  const entry = RELATED_MODULE_REGISTRY[relatedModule];
  if (!entry || recordId == null) return false;

  const [row] = await tenantDB.query(
    `SELECT id FROM \`${entry.table}\` WHERE id = :recordId AND isDelete = 0 LIMIT 1`,
    { replacements: { recordId }, type: tenantDB.QueryTypes.SELECT },
  );
  return !!row;
}
