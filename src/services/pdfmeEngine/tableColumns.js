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
  const kept = ALL_COLUMNS.filter((c) => {
    if (c.required) return true;
    if (c.defaultOn === false) return opts[c.key] === true;
    return opts[c.key] !== false;
  });
  const widthSum = kept.reduce((sum, c) => sum + c.widthPct, 0);
  // Rescale so widths still sum to 100 after dropping columns, otherwise the
  // table leaves dead whitespace on the right for whatever % was removed.
  return kept.map((c) => ({ ...c, widthPct: (c.widthPct / widthSum) * 100 }));
}
