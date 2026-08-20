// Account statement (allAccountTransactionOfContactV1.ejs port) — company +
// contact header side by side, one unbounded transaction table, A4 portrait.
// Own doc shape, not registered in templates.js's DOC_TYPES (internal/
// customer-facing ledger export, not a Designer-customizable document yet).
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

const PT_TO_MM = 0.3528;
function lineHeightMM(fontSize, lineHeight) {
  return fontSize * lineHeight * PT_TO_MM;
}

export const STATEMENT_COLUMNS = [
  { key: "no", label: "No.", widthPct: 6, alignment: "left" },
  { key: "date", label: "Date & Time", widthPct: 16, alignment: "left" },
  { key: "remark", label: "Remark", widthPct: 30, alignment: "left" },
  { key: "credit", label: "Credit", widthPct: 14, alignment: "right" },
  { key: "debit", label: "Debit", widthPct: 14, alignment: "right" },
  { key: "balance", label: "Balance", widthPct: 20, alignment: "right" },
];

// leftLineCount/rightLineCount: real line counts for the company block (left)
// and statement+contact block (right), so the divider/table start below
// whichever column is taller — same "measure real content, don't guess a
// fixed box" approach as accountTransactionTemplate.js.
export function buildAccountStatementTemplate({ leftLineCount, rightLineCount, hasRows = true }) {
  const headerLineHeight = lineHeightMM(9, 1.4);
  // +15% safety margin — measured mm/line from lineHeightMM() has run short
  // of the real rendered line spacing in practice (accountTransactionTemplate.js
  // hit the same gap), so pad the estimate rather than the gap alone.
  const headerHeight = Math.max(leftLineCount, rightLineCount, 1) * headerLineHeight * 1.3;
  const tableY = headerHeight + 8;

  const columnStyles = {};
  STATEMENT_COLUMNS.forEach((c, i) => {
    if (c.alignment !== "left") columnStyles[i] = { alignment: c.alignment };
  });

  return {
    basePdf: { width: PAGE_WIDTH, height: PAGE_HEIGHT, padding: [MARGIN, MARGIN, MARGIN, MARGIN] },
    schemas: [
      [
        textField({
          name: "leftHeaderBlock",
          position: { x: 0, y: 0 },
          width: 95,
          height: headerHeight,
          fontSize: 9,
          lineHeight: 1.4,
          content: "",
        }),
        textField({
          name: "rightHeaderBlock",
          position: { x: 95, y: 0 },
          width: 95,
          height: headerHeight,
          fontSize: 9,
          alignment: "right",
          lineHeight: 1.4,
          content: "",
        }),
        textField({
          name: "divider",
          position: { x: 0, y: headerHeight + 4 },
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
          position: { x: 0, y: tableY },
          width: CONTENT_WIDTH,
          // Just past the header row when there's nothing to show (so
          // noDataText, right below, doesn't land at the bottom of an
          // otherwise-empty page) — the generous multi-page budget only
          // when there's real content to paginate.
          height: hasRows ? Math.min(PAGE_HEIGHT - MARGIN * 2 - tableY, 220) : 14,
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
          position: { x: 0, y: tableY + (hasRows ? Math.min(PAGE_HEIGHT - MARGIN * 2 - tableY, 220) : 14) + 4 },
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
