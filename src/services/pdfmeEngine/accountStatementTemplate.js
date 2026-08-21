// Account statement (allAccountTransactionOfContactV1.ejs port) — company +
// contact header side by side, one unbounded transaction table, A4 portrait.
//
// Fixed field positions (like buildTemplate.js's cart-doc buyer info block),
// not the previous "measure real line counts, compute box heights" approach
// — that approach computed box height from whatever data was on hand at
// generation time, but a company's own SAVED customization freezes that
// height permanently, so a later statement with more contact lines than the
// one it happened to be sized from would overflow into the table below.
// Fixed positions have the opposite, already-accepted tradeoff (quotation's
// buyer block has the same one): an empty optional field just leaves a gap
// (hideIfEmpty) rather than reclaiming its space, but the layout is
// consistent whether pdfme is building it fresh or replaying a company's
// frozen JSON — and every field is independently movable in the Designer
// canvas, so a company can rearrange them however they want.
//
// Row spacing: pdfme does NOT clip text to a field's declared height — text
// taller than its box just draws past the bottom edge into whatever field
// comes next (confirmed by an actual render: the first cut of this file
// used a flat 5mm/row and every row visibly overlapped the one below it).
// rowH() below is the same fontSize*lineHeight*mmPerPt*1.3-safety-margin
// formula the old dynamic builder used per LINE, applied per FIELD here
// since each row is its own single-line field now.
//
// Per-row Credit/Debit-colored balance (the EJS's formatBalanceCell, green
// Cr / red Dr per row) is dropped — same reason as taskDueListTemplate.js:
// pdfme's table plugin (node_modules/@pdfme/schemas/dist/tables/types.d.ts)
// has no per-row style hook, only whole-table head/bodyStyles and per-COLUMN
// columnStyles.alignment. The "(Cr)"/"(Dr)" suffix in the text itself still
// carries the information, just without the color emphasis. The totals row
// is appended as a plain last row of the same table for the same reason
// (no way to give just that row a highlighted background) — "Total" goes in
// the first cell rather than a 3-column colspan (pdfme table has no colspan).
import { tableField, textField } from "./buildTemplate.js";

const PAGE_WIDTH = 210; // A4, matches the EJS's own @page margin: 10mm (not
const PAGE_HEIGHT = 297; // the pdf-creator-node options' 15mm border)
const MARGIN = 10;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COL_WIDTH = 95;

const PT_TO_MM = 0.3528;
function rowH(fontSize, lineHeight = 1.4) {
  return fontSize * lineHeight * PT_TO_MM * 1.3;
}
const ROW_9 = rowH(9); // ~5.8mm — body rows
const ROW_11 = rowH(11); // ~7.1mm — bold title rows
const ROW_9_TALL = ROW_9 * 1.8; // ~10.4mm — address rows (may wrap 2 lines)

export const STATEMENT_COLUMNS = [
  { key: "no", label: "No.", widthPct: 6, alignment: "left" },
  { key: "date", label: "Date & Time", widthPct: 16, alignment: "left" },
  { key: "remark", label: "Remark", widthPct: 30, alignment: "left" },
  { key: "credit", label: "Credit", widthPct: 14, alignment: "right" },
  { key: "debit", label: "Debit", widthPct: 14, alignment: "right" },
  { key: "balance", label: "Balance", widthPct: 20, alignment: "right" },
];

// Right column (title + date range + up to 7 contact lines, 2 of which are
// generous "may wrap" address rows) is the taller of the two — left
// (company block, 4 rows max) always fits under it.
const RIGHT_ROWS_Y = (() => {
  let y = 0;
  const ys = {};
  const advance = (key, h) => {
    ys[key] = y;
    y += h;
  };
  advance("statementTitle", ROW_11);
  advance("statementDateRange", ROW_9);
  advance("contactName", ROW_9);
  advance("contactCompany", ROW_9);
  advance("contactMobile", ROW_9);
  advance("contactEmail", ROW_9);
  advance("contactAddress", ROW_9_TALL);
  advance("contactShippingAddress", ROW_9_TALL);
  advance("contactGSTIN", ROW_9);
  ys.__end = y;
  return ys;
})();

const HEADER_HEIGHT = RIGHT_ROWS_Y.__end;
const TABLE_Y = HEADER_HEIGHT + 8;

function hideIfEmpty(name) {
  return { dataSource: name, visibilityCondition: { mode: "hideIfEmpty" } };
}

export function buildAccountStatementTemplate({ hasRows = true } = {}) {
  const columnStyles = {};
  STATEMENT_COLUMNS.forEach((c, i) => {
    if (c.alignment !== "left") columnStyles[i] = { alignment: c.alignment };
  });

  const right = (name, height, overrides = {}) =>
    textField({ name, position: { x: COL_WIDTH, y: RIGHT_ROWS_Y[name] }, width: COL_WIDTH, height, fontSize: 9, alignment: "right", lineHeight: 1.4, content: "", ...hideIfEmpty(name), ...overrides });

  return {
    basePdf: { width: PAGE_WIDTH, height: PAGE_HEIGHT, padding: [MARGIN, MARGIN, MARGIN, MARGIN] },
    schemas: [
      [
        // Left column — company block.
        textField({ name: "companyName", position: { x: 0, y: 0 }, width: COL_WIDTH, height: ROW_11, fontSize: 11, fontName: "Poppins Bold", lineHeight: 1.4, content: "", ...hideIfEmpty("companyName") }),
        textField({ name: "companyAddress", position: { x: 0, y: ROW_11 }, width: COL_WIDTH, height: ROW_9_TALL, fontSize: 9, lineHeight: 1.4, content: "", ...hideIfEmpty("companyAddress") }),
        textField({ name: "companyContactLine", position: { x: 0, y: ROW_11 + ROW_9_TALL }, width: COL_WIDTH, height: ROW_9, fontSize: 9, lineHeight: 1.4, content: "", ...hideIfEmpty("companyContactLine") }),
        textField({ name: "companyGSTIN", position: { x: 0, y: ROW_11 + ROW_9_TALL + ROW_9 }, width: COL_WIDTH, height: ROW_9, fontSize: 9, lineHeight: 1.4, content: "", ...hideIfEmpty("companyGSTIN") }),

        // Right column — statement title/range + contact block.
        textField({
          name: "statementTitle",
          position: { x: COL_WIDTH, y: RIGHT_ROWS_Y.statementTitle },
          width: COL_WIDTH,
          height: ROW_11,
          fontSize: 11,
          fontName: "Poppins Bold",
          alignment: "right",
          content: "Account Statement",
          readOnly: true,
        }),
        right("statementDateRange", ROW_9),
        right("contactName", ROW_9, { fontName: "Poppins Bold" }),
        right("contactCompany", ROW_9),
        right("contactMobile", ROW_9),
        right("contactEmail", ROW_9),
        right("contactAddress", ROW_9_TALL),
        right("contactShippingAddress", ROW_9_TALL),
        right("contactGSTIN", ROW_9),

        textField({
          name: "divider",
          position: { x: 0, y: HEADER_HEIGHT + 4 },
          width: CONTENT_WIDTH,
          height: 0.3,
          backgroundColor: "#000000",
          content: "",
          readOnly: true,
        }),
        // A table field's declared `height` is its per-page budget, not a
        // hard cap — pdfme auto-continues overflow content onto further
        // pages using this same box (same pattern buildTemplate.js's cart
        // itemsTable uses, a modest fixed 75mm, not "fill the rest of the
        // page"). Giving it the entire remaining page height crashes
        // @pdfme/common's dynamic-table pagination the moment another field
        // (noDataText, below) sits inside that oversized box — confirmed by
        // isolated repro, not a guess. Capped instead; any table field
        // positioned AFTER this one must stay below tableHeight, never
        // inside it.
        tableField({
          name: "statementTable",
          position: { x: 0, y: TABLE_Y },
          width: CONTENT_WIDTH,
          // Just past the header row when there's nothing to show (so
          // noDataText, right below, doesn't land at the bottom of an
          // otherwise-empty page) — the generous multi-page budget only
          // when there's real content to paginate.
          height: hasRows ? Math.min(PAGE_HEIGHT - MARGIN * 2 - TABLE_Y, 220) : 14,
          showHead: true,
          content: JSON.stringify([["1", "20 Aug 2026", "Sample", "1,000", "-", "1,000 (Cr)"]]),
          head: STATEMENT_COLUMNS.map((c) => c.label),
          headWidthPercentages: STATEMENT_COLUMNS.map((c) => c.widthPct),
          headStyles: { backgroundColor: "#f8f9fa", fontColor: "#000000", fontSize: 8, alignment: "left", padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } },
          bodyStyles: { fontSize: 7.5, alignment: "left", padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } },
          columnStyles,
        }),
        // Separate field rather than cramming "No transactions found" into
        // the table's narrow first column (pdfme table has no colspan to
        // center it across all 6 columns the way the EJS's <td colspan="6">
        // does) — shown instead of a fake row when there are zero real rows.
        // Positioned below the table's own box (see the crash note above),
        // never inside it.
        textField({
          name: "noDataText",
          position: { x: 0, y: TABLE_Y + (hasRows ? Math.min(PAGE_HEIGHT - MARGIN * 2 - TABLE_Y, 220) : 14) + 4 },
          width: CONTENT_WIDTH,
          height: 6,
          fontSize: 9,
          alignment: "center",
          content: "No transactions found",
          visibilityCondition: { mode: "compare", field: "hasRows", operator: "equals", value: "" },
        }),
      ],
    ],
  };
}
