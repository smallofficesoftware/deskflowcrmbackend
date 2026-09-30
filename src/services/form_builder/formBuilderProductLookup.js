// Product line in a repeating table, filled from the price list (plan item
// N5): a repeater column of type "reference" with master "product" can map
// PRODUCT_FILL_COLUMNS to sibling columns of that same row — pick a
// product, its rate/unit/code fill in beside it, still editable afterwards.
//
// Field prop (on the reference column): product_fill_map: { rate: "<sibling
// column key>", unit: "<...>", product_code: "<...>" }.
import { productModel } from "../../models/product_settings/productModel.js";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { resolveFormAccess } from "./formBuilderRights.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";

// Product model column -> the plain label shown in the editor.
export const PRODUCT_FILL_COLUMNS = {
  rate: "Rate",
  unit: "Unit",
  product_code: "Product code",
};

// One product's fillable values (plan §1's price-list note: the product's
// own `rate` is the price-list-independent default; a per-price-list rate
// override, if the company uses those, is out of scope for v1 — this reads
// the same `rate` column the product screen itself shows as the price).
export async function getProductFillValues({ tenantDB, company_masters_id, productId }) {
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const Product = productModel(tenantDB);
  const row = await Product.findOne({
    where: { id, company_masters_id, isDelete: 0 },
    attributes: ["id", "product_name", "rate", "unit", "product_code"],
    raw: true,
  });
  if (!row) return null;
  return {
    rate: row.rate != null ? Number(row.rate) : null,
    unit: row.unit || null,
    product_code: row.product_code || null,
    product_name: row.product_name || null,
  };
}

// Repeater column types a product detail may be copied into.
const FILL_TARGET_TYPES = new Set(["text", "number", "currency"]);

function nameOf(field) {
  return `“${field.label || field.key}”`;
}

// POST /form-builder/product-fill-values { form_id, product_id } -> the
// values above. Internal only, and only while filling a form this login has
// access to — same guard as customer-search (formBuilderCustomerLookup.js).
export const getProductFillValuesEndpoint = async (req) => {
  try {
    const a_application_login_id = req.body?.a_application_login_id;
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company) return resError({ ack_msg: "Company not found for login ID" });
    const company_masters_id = company.company_masters_id;

    const { form_id, product_id } = req.body || {};
    const form = await formBuilderFormModel(req.tenantDB).findOne({ where: { id: form_id, company_masters_id, isDelete: 0 } });
    if (!form || !form.published_schema_json) return resError({ ack_msg: "Form not found or not published" });

    const access = await resolveFormAccess({ form, company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
    if (!access.canFill) return resError({ code: 403, ack_msg: "No access to fill this form" });

    const values = await getProductFillValues({ tenantDB: req.tenantDB, company_masters_id, productId: product_id });
    if (!values) return resError({ ack_msg: "Product not found" });
    return resSuccess({ data: { item: values } });
  } catch (e) {
    console.error("getProductFillValuesEndpoint error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Publish check for every repeater's product-lookup columns. Returns a
// plain-words message or null.
export function findProductLookupProblems(fields) {
  for (const rep of Array.isArray(fields) ? fields : []) {
    if (rep?.type !== "repeater") continue;
    const columns = Array.isArray(rep.columns) ? rep.columns : [];
    for (const col of columns) {
      if (col?.type !== "reference" || col.master !== "product" || col.product_fill_map == null) continue;
      const map = col.product_fill_map;
      if (typeof map !== "object" || Array.isArray(map)) {
        return `${nameOf(rep)}: ${nameOf(col)}'s "fill from product" settings couldn't be read. Set them again.`;
      }
      const used = new Set();
      for (const [productColumn, targetKey] of Object.entries(map)) {
        if (targetKey == null || targetKey === "") continue;
        if (!PRODUCT_FILL_COLUMNS[productColumn]) {
          return `${nameOf(rep)}: “${productColumn}” isn't a product detail that can be copied.`;
        }
        const target = columns.find((c) => c.key === targetKey);
        if (!target || target === col) {
          return `${nameOf(rep)}: the column that should receive the product's ${PRODUCT_FILL_COLUMNS[productColumn].toLowerCase()} was deleted. Pick another column or clear it.`;
        }
        if (!FILL_TARGET_TYPES.has(target.type)) {
          return `${nameOf(rep)}: ${nameOf(target)} can't receive the product's ${PRODUCT_FILL_COLUMNS[productColumn].toLowerCase()} — choose a text, number or currency column.`;
        }
        if (used.has(targetKey)) {
          return `${nameOf(rep)}: ${nameOf(target)} is set to receive two different product details. Give each detail its own column.`;
        }
        used.add(targetKey);
      }
    }
  }
  return null;
}
