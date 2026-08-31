// Employee (Team) account statement — Team's OWN customization slot,
// deliberately separate from accountStatementTemplate.js (the Contact
// variant) even though the layout started identical, so a company can brand
// an employee statement differently from a customer one. Same fixed-position
// approach and rowH() spacing formula as accountStatementTemplate.js — see
// that file's header comment for why fixed positions (not measured-from-
// content heights) are used. Right column is employee-appropriate instead of
// contact-appropriate: an employee record has no company/GSTIN/shipping
// address, so it's 3 fields (name/mobile/email) instead of the contact
// version's 7.
import { tableField, textField } from "./buildTemplate.js";

const PAGE_WIDTH = 210; // A4
const PAGE_HEIGHT = 297;
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

// Right column (title + date range + 3 employee lines) is much shorter than
// the contact version's 9 rows — left (company block, 4 rows) is now the
// taller of the two, so HEADER_HEIGHT is driven by the left column instead.
const RIGHT_ROWS_Y = (() => {
  let y = 0;
  const ys = {};
  const advance = (key, h) => {
    ys[key] = y;
    y += h;
  };
  advance("statementTitle", ROW_11);
  advance("statementDateRange", ROW_9);
  advance("employeeName", ROW_9);
  advance("employeeMobile", ROW_9);
  advance("employeeEmail", ROW_9);
  ys.__end = y;
  return ys;
})();

const LEFT_HEIGHT = ROW_11 + ROW_9_TALL + ROW_9 + ROW_9; // companyName + companyAddress(tall) + companyContactLine + companyGSTIN
const HEADER_HEIGHT = Math.max(RIGHT_ROWS_Y.__end, LEFT_HEIGHT);
const TABLE_Y = HEADER_HEIGHT + 8;

function hideIfEmpty(name) {
  return { dataSource: name, visibilityCondition: { mode: "hideIfEmpty" } };
}

export function buildEmployeeAccountStatementTemplate({ hasRows = true } = {}) {
  const columnStyles = {};
  STATEMENT_COLUMNS.forEach((c, i) => {
    if (c.alignment !== "left") columnStyles[i] = { alignment: c.alignment };
  });

  // pdfme measures schema position.x/y from the PAGE's absolute top-left
  // corner, NOT from inside the basePdf.padding box (confirmed by reading
  // @pdfme/common: getContentHeight subtracts padding from the page height
  // for table-pagination math, but a field's own position is never offset
  // by padding at all) — a field literally positioned at (0,0) renders
  // sitting on the page edge, inside/under the margin guide the Designer
  // draws, not below it. Every position below adds MARGIN so the content
  // starts exactly at the inner edge of the padding box instead.
  const right = (name, height, overrides = {}) =>
    textField({ name, position: { x: MARGIN + COL_WIDTH, y: MARGIN + RIGHT_ROWS_Y[name] }, width: COL_WIDTH, height, fontSize: 9, alignment: "right", lineHeight: 1.4, content: "", ...hideIfEmpty(name), ...overrides });

  return {
    basePdf: { width: PAGE_WIDTH, height: PAGE_HEIGHT, padding: [MARGIN, MARGIN, MARGIN, MARGIN] },
    schemas: [
      [
        // Left column — company block (same as the Contact variant).
        textField({ name: "companyName", position: { x: MARGIN, y: MARGIN }, width: COL_WIDTH, height: ROW_11, fontSize: 11, fontName: "Poppins Bold", lineHeight: 1.4, content: "", ...hideIfEmpty("companyName") }),
        textField({ name: "companyAddress", position: { x: MARGIN, y: MARGIN + ROW_11 }, width: COL_WIDTH, height: ROW_9_TALL, fontSize: 9, lineHeight: 1.4, content: "", ...hideIfEmpty("companyAddress") }),
        textField({ name: "companyContactLine", position: { x: MARGIN, y: MARGIN + ROW_11 + ROW_9_TALL }, width: COL_WIDTH, height: ROW_9, fontSize: 9, lineHeight: 1.4, content: "", ...hideIfEmpty("companyContactLine") }),
        textField({ name: "companyGSTIN", position: { x: MARGIN, y: MARGIN + ROW_11 + ROW_9_TALL + ROW_9 }, width: COL_WIDTH, height: ROW_9, fontSize: 9, lineHeight: 1.4, content: "", ...hideIfEmpty("companyGSTIN") }),

        // Right column — statement title/range + employee block.
        textField({
          name: "statementTitle",
          position: { x: MARGIN + COL_WIDTH, y: MARGIN + RIGHT_ROWS_Y.statementTitle },
          width: COL_WIDTH,
          height: ROW_11,
          fontSize: 11,
          fontName: "Poppins Bold",
          alignment: "right",
          content: "Employee Account Statement",
          readOnly: true,
        }),
        right("statementDateRange", ROW_9),
        right("employeeName", ROW_9, { fontName: "Poppins Bold" }),
        right("employeeMobile", ROW_9),
        right("employeeEmail", ROW_9),

        textField({
          name: "divider",
          position: { x: MARGIN, y: MARGIN + HEADER_HEIGHT + 4 },
          width: CONTENT_WIDTH,
          height: 0.3,
          backgroundColor: "#000000",
          content: "",
          readOnly: true,
        }),
        tableField({
          name: "statementTable",
          position: { x: MARGIN, y: MARGIN + TABLE_Y },
          width: CONTENT_WIDTH,
          height: hasRows ? Math.min(PAGE_HEIGHT - MARGIN * 2 - TABLE_Y, 220) : 14,
          showHead: true,
          content: JSON.stringify([["1", "20 Aug 2026", "Sample", "1,000", "-", "1,000 (Cr)"]]),
          head: STATEMENT_COLUMNS.map((c) => c.label),
          headWidthPercentages: STATEMENT_COLUMNS.map((c) => c.widthPct),
          headStyles: { backgroundColor: "#f8f9fa", fontColor: "#000000", fontSize: 8, alignment: "left", padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } },
          bodyStyles: { fontSize: 7.5, alignment: "left", padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } },
          columnStyles,
        }),
        textField({
          name: "noDataText",
          position: { x: MARGIN, y: MARGIN + TABLE_Y + (hasRows ? Math.min(PAGE_HEIGHT - MARGIN * 2 - TABLE_Y, 220) : 14) + 4 },
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
