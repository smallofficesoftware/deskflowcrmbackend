import { QueryTypes } from "sequelize";
import { RELATED_MODULE_REGISTRY } from "./formBuilderMasterRegistry.js";

// "Possible match" for a form's related module (the Contact phone/email match lives in
// formBuilderSubmissionService.js). A field on the form is tagged match_key "related"; whatever the
// filler types there is looked up here. The result is only ever a suggestion - staff confirm it with
// Link - so a visitor typing someone else's number never attaches an entry by themselves.
//
//   id        the record's id
//   number    carts.cart_number (quotation / order / invoice / ... number)
//   job       production_transactions.job_id (work order number)
//   code      products.product_code
const MATCH_COLUMNS = {
  visit: ["id"],
  inquiry: ["id"],
  task: ["id"],
  support_ticket: ["id"],
  job_card: ["id"],
  expense: ["id"],
  work_order: ["id", "job_id"],
  product: ["product_code"],
  order: ["id", "cart_number"],
  quotation: ["id", "cart_number"],
  sales_invoice: ["id", "cart_number"],
  purchase_invoice: ["id", "cart_number"],
  purchase_order: ["id", "cart_number"],
  sales_return: ["id", "cart_number"],
  purchase_return: ["id", "cart_number"],
  inward: ["id", "cart_number"],
  dispatch: ["id", "cart_number"],
  proforma_invoice: ["id", "cart_number"],
};

/** Modules that can be matched through a "related" match field (everything except contact). */
export const relatedMatchModules = () => Object.keys(MATCH_COLUMNS);

/** { where, replacements } for the lookup, or null when the module/value can't be matched. Pure. */
export function buildRelatedMatch(relatedModule, rawValue, company_masters_id) {
  const entry = RELATED_MODULE_REGISTRY[relatedModule];
  const columns = MATCH_COLUMNS[relatedModule];
  const value = rawValue == null ? "" : String(rawValue).trim();
  if (!entry || !columns || !value || value.length > 100) return null;

  const isNumeric = /^\d{1,10}$/.test(value);
  const parts = [];
  const replacements = { value, company_masters_id };
  for (const column of columns) {
    if (column === "id") {
      if (!isNumeric) continue;
      parts.push("`id` = :idValue");
      replacements.idValue = Number(value);
    } else {
      parts.push(`\`${column}\` = :value`);
    }
  }
  if (parts.length === 0) return null;

  const extra = entry.extraWhere ? ` AND ${entry.extraWhere}` : "";
  return {
    sql: `SELECT id FROM \`${entry.table}\` WHERE company_masters_id = :company_masters_id AND isDelete = 0${extra} AND (${parts.join(" OR ")}) ORDER BY id DESC LIMIT 1`,
    replacements,
  };
}

/** The matching record's id, or null. */
export async function matchRelatedRecord({ tenantDB, relatedModule, value, company_masters_id }) {
  const built = buildRelatedMatch(relatedModule, value, company_masters_id);
  if (!built) return null;
  const [row] = await tenantDB.query(built.sql, { replacements: built.replacements, type: QueryTypes.SELECT });
  return row?.id || null;
}
