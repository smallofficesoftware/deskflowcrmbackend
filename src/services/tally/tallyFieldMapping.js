// Pure rules for Tally "custom field" (UDF) mappings - no DB, no network, so they can be tested on their own.
// plans/2026-10-08-marketplace-tally-plan.txt section 4.6: a CRM field (standard column or custom field) is
// mapped to a UDF the customer already created in Tally; a CRM field with no mapping is simply not sent, and
// we never create or install UDFs/TDL ourselves.

/** custom_field_form_masters.form_type for a Sales Invoice - the document the voucher is built from. */
export const FORM_SALES_INVOICE = 7;

/** Standard invoice columns that may feed a UDF (labels are what the mapping screen shows). Anything not in
 *  this list can never be read through a mapping, even if a saved row asks for it. */
export const STANDARD_INVOICE_COLUMNS = [
  { ref: "cart_remark", label: "Remark" },
  { ref: "to_customer_name", label: "Customer name" },
  { ref: "to_customer_company_name", label: "Customer company" },
  { ref: "to_customer_phone", label: "Customer phone" },
  { ref: "to_customer_email", label: "Customer email" },
  { ref: "to_customer_gst_number", label: "Customer GST number" },
  { ref: "Address", label: "Billing address" },
  { ref: "shipping_address", label: "Shipping address" },
];

/** Custom field slots on the carts table (carts_column_text_1 ...). Only these names are ever read from a cart. */
export const CUSTOM_COLUMN_PATTERN = /^carts_column_(text|text_area|number|decimal|date|dropdown)_\d+$/;

/** A UDF name goes straight into an XML tag (UDF:<name>), so it is limited to what a tag can safely hold. */
export const UDF_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,79}$/;

export const isValidUdfName = (name) => UDF_NAME_PATTERN.test(String(name ?? ""));

/** The saved name with surrounding spaces dropped and inner spaces made underscores (how Tally writes a UDF
 *  name with spaces in a tag), or "" when the result is not a valid tag name. */
export const normalizeUdfName = (raw) => {
  const name = String(raw ?? "").trim().replace(/\s+/g, "_");
  return isValidUdfName(name) ? name : "";
};

const MAX_VALUE_LENGTH = 250;

/** Text safe to put in a Tally tag: control characters removed, trimmed, shortened. */
export const cleanUdfValue = (value) =>
  String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, MAX_VALUE_LENGTH);

/**
 * The UDF values to send with one invoice.
 * @param {object[]} mappings      active marketplace_addon_field_mappings rows for this form
 * @param {Map<number,{reference_column_name:string}>} customFieldsById  custom_field_form_masters by id
 * @param {object} cart            the carts row
 * @returns {{name:string, value:string}[]}  empty values are skipped; a name used twice keeps the first
 */
export const buildUdfList = (mappings, customFieldsById, cart) => {
  const out = [];
  const used = new Set();
  for (const m of mappings || []) {
    const name = normalizeUdfName(m.external_field_name);
    if (!name || used.has(name)) continue;

    let column = null;
    if (m.source_type === "column") {
      if (STANDARD_INVOICE_COLUMNS.some((c) => c.ref === m.source_ref)) column = m.source_ref;
    } else if (m.source_type === "custom_field") {
      const field = customFieldsById?.get(Number(m.source_ref));
      if (field && CUSTOM_COLUMN_PATTERN.test(String(field.reference_column_name ?? ""))) column = field.reference_column_name;
    }
    if (!column) continue;

    const value = cleanUdfValue(cart?.[column]);
    if (!value) continue;
    used.add(name);
    out.push({ name, value });
  }
  return out;
};
