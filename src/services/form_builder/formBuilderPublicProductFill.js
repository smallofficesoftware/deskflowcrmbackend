// Pure rules for the PUBLIC product auto-fill (a repeater's product column
// copying rate / unit / code into sibling cells - formBuilderProductLookup.js
// is the signed-in version). A public visitor may only get the product
// details the form's owner actually mapped to a column, never the whole
// product row.

// The set of product details ("rate" | "unit" | "product_code") that any
// repeater product column of this form is set up to copy somewhere.
export function allowedProductFillColumns(fields) {
  const allowed = new Set();
  for (const rep of Array.isArray(fields) ? fields : []) {
    if (rep?.type !== "repeater") continue;
    for (const col of Array.isArray(rep.columns) ? rep.columns : []) {
      if (col?.type !== "reference" || col.master !== "product") continue;
      const map = col.product_fill_map;
      if (!map || typeof map !== "object" || Array.isArray(map)) continue;
      for (const [productColumn, targetKey] of Object.entries(map)) {
        if (targetKey != null && targetKey !== "") allowed.add(productColumn);
      }
    }
  }
  return allowed;
}

// { rate, unit, product_code, product_name } -> only the allowed keys.
export function pickAllowedValues(values, allowed) {
  const picked = {};
  for (const key of allowed) {
    if (values && Object.prototype.hasOwnProperty.call(values, key)) picked[key] = values[key];
  }
  return picked;
}
