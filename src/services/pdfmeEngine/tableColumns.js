// Single source of truth for the item table's column set, shared by
// buildTemplate.js (head/headWidthPercentages/columnStyles) and
// orderInputMapper.js (each row's value array) — they MUST stay in sync on
// column count/order or the table plugin crashes.
// Column order matches the real app's orderPdfV1.ejs header row order:
// No. | Image | Description | HSN/SAC | Qty/Unit | Rate | Discount |
// CGST | SGST | IGST | Total Amt. The real app nests CGST/SGST/IGST/Total
// under one spanning "Amount" header — pdfme's table plugin has no
// colspan/multi-row header support (its `head` is one flat array of labels),
// so those are flattened into individual top-level columns here instead.
export const ALL_COLUMNS = [
  { key: "no", label: "No.", widthPct: 8, alignment: "center", required: true },
  { key: "image", label: "", widthPct: 12, alignment: "center", defaultOn: false },
  { key: "description", label: "Particular Description", widthPct: 30, alignment: "left", required: true },
  { key: "hsn", label: "HSN/SAC", widthPct: 9, alignment: "right" },
  { key: "qty", label: "Qty/Unit", widthPct: 12, alignment: "right" },
  { key: "rate", label: "Rate", widthPct: 12, alignment: "right" },
  { key: "discount", label: "Dis(%)", widthPct: 7, alignment: "right", defaultOn: false },
  // Tracked product serial numbers (cart_vs_serial_numbers) for this item,
  // comma-separated - opt-in like image/discount/cgst/sgst/igst, since most
  // companies don't sell serial-tracked products. Mirrors the legacy EJS "SN
  // No:" block (orderPdfV1.ejs), just as its own column instead of being
  // folded into the description cell.
  { key: "serial", label: "Serial No.", widthPct: 12, alignment: "left", defaultOn: false },
  { key: "cgst", label: "CGST", widthPct: 8, alignment: "right", defaultOn: false },
  { key: "sgst", label: "SGST", widthPct: 8, alignment: "right", defaultOn: false },
  { key: "igst", label: "IGST", widthPct: 8, alignment: "right", defaultOn: false },
  { key: "total", label: "Total Amt", widthPct: 15, alignment: "right" },
];

// columnOptions: { qty?, rate?, total?, hsn?: boolean (default true), image?,
// discount?, cgst?, sgst?, igst?: boolean (default FALSE, opt-in) } — "no"
// and "description" are always shown (required: true). image/discount/cgst/
// sgst/igst are opt-in (defaultOn: false) since they depend on business type
// (intra vs inter-state) or aren't needed by every doc type.
export function resolveColumns(columnOptions) {
  const opts = columnOptions || {};
  const builtIn = ALL_COLUMNS.filter((c) => {
    if (c.required) return true;
    if (c.defaultOn === false) return opts[c.key] === true;
    return opts[c.key] !== false;
  });

  // opts.customColumns: [{ key, label }] - Product Custom Fields added from
  // the Designer's Add Field dropdown. `key` is the product custom field's
  // reference_column_name (products_column_*), which is also the cart item
  // column the row value is read from (orderInputMapper.js). Placed just
  // before the "total" column so the amount stays last. They live in
  // columnOptions (saved on the template) so every resolveColumns caller -
  // template build, input rows, image overlay - sees the same set.
  const takenKeys = new Set(builtIn.map((c) => c.key));
  const custom = (Array.isArray(opts.customColumns) ? opts.customColumns : [])
    .filter((c) => c && c.key && !takenKeys.has(String(c.key)) && takenKeys.add(String(c.key)))
    .map((c) => ({ key: String(c.key), label: String(c.label ?? c.key), widthPct: 12, alignment: "left", custom: true }));
  const totalAt = builtIn.findIndex((c) => c.key === "total");
  const kept =
    totalAt === -1 || !custom.length
      ? [...builtIn, ...custom]
      : [...builtIn.slice(0, totalAt), ...custom, ...builtIn.slice(totalAt)];

  const widthSum = kept.reduce((sum, c) => sum + c.widthPct, 0);
  // Rescale so widths still sum to 100 after dropping columns, otherwise the
  // table leaves dead whitespace on the right for whatever % was removed.
  return kept.map((c) => ({ ...c, widthPct: (c.widthPct / widthSum) * 100 }));
}
