// Due-task-list PDF (generateDueTaskPdfandSendMail's daily cron mail
// attachment) — its own doc shape: company header block + one unbounded
// task table, A4 landscape, no items/GST. Not registered in templates.js's
// DOC_TYPES — this is an internal ops report, not a Designer-customizable
// customer document.
//
// The old EJS (dueTaskListViewV1.ejs) renders one heading + one table PER
// team member, with each team member's task numbering restarting at 1. pdfme
// has no dynamic-count-of-(heading+table) construct on one page flow the
// way the cart-doc table field's own auto-pagination does — instead this
// flattens every team's rows into ONE table with a "Team" column added,
// team name repeated on every one of that team's rows (rather than shown
// once per group) and "No." running per-team like the original. A fair
// equivalent for an internal report, not a literal layout port — deliberate,
// not an oversight (this doc has no statutory/GST content, unlike the
// invoice family, so exact field-for-field fidelity isn't the same bar).
// Per-row status text color (tx.status_color in the EJS) is also dropped —
// pdfme's table plugin (checked: node_modules/@pdfme/schemas/dist/tables/types.d.ts)
// has no per-cell/per-row style hook, only whole-table headStyles/bodyStyles
// and per-COLUMN columnStyles.alignment. Status stays bold black text instead.
import { tableField, textField } from "./buildTemplate.js";

const PAGE = { width: 297, height: 210 }; // A4 landscape, matches the old pdf.create options

export const TASK_TABLE_COLUMNS = [
  { key: "no", label: "No.", widthPct: 4, alignment: "center" },
  { key: "team", label: "Team Person", widthPct: 13, alignment: "left" },
  { key: "taskNo", label: "Task No.", widthPct: 8, alignment: "left" },
  { key: "title", label: "Task Title", widthPct: 30, alignment: "left" },
  { key: "status", label: "Current Status", widthPct: 12, alignment: "right" },
  { key: "assignedTo", label: "Assigned To", widthPct: 13, alignment: "right" },
  { key: "date", label: "Date", widthPct: 14, alignment: "right" },
  { key: "dueDays", label: "Due Days", widthPct: 6, alignment: "right" },
];

export function buildTaskDueListTemplate() {
  const columnStyles = {};
  TASK_TABLE_COLUMNS.forEach((c, i) => {
    if (c.alignment !== "left") columnStyles[i] = { alignment: c.alignment };
  });

  return {
    basePdf: { width: PAGE.width, height: PAGE.height, padding: [15, 15, 15, 15] },
    schemas: [
      [
        // Split from one companyHeaderBlock text field into the same
        // granular companyName/companyAddress/companyContactLine/
        // companyGSTIN fields accountStatementTemplate.js and
        // employeeAccountStatementTemplate.js already use — the combined
        // block couldn't be bound to any one real data key on its own,
        // only worked as static placeholder text nobody could actually
        // customize per-field. 40mm of header room was already reserved
        // (divider starts at y:42), so no other field needs to move.
        textField({ name: "companyName", position: { x: 0, y: 0 }, width: 200, height: 11, fontSize: 11, fontName: "Poppins Bold", lineHeight: 1.4, content: "", visibilityCondition: { mode: "hideIfEmpty" } }),
        textField({ name: "companyAddress", position: { x: 0, y: 11 }, width: 200, height: 9, fontSize: 9, lineHeight: 1.4, content: "", visibilityCondition: { mode: "hideIfEmpty" } }),
        textField({ name: "companyContactLine", position: { x: 0, y: 20 }, width: 200, height: 9, fontSize: 9, lineHeight: 1.4, content: "", visibilityCondition: { mode: "hideIfEmpty" } }),
        textField({ name: "companyGSTIN", position: { x: 0, y: 29 }, width: 200, height: 9, fontSize: 9, lineHeight: 1.4, content: "", visibilityCondition: { mode: "hideIfEmpty" } }),
        textField({
          name: "divider",
          position: { x: 0, y: 42 },
          width: 267,
          height: 0.3,
          backgroundColor: "#000000",
          content: "",
          readOnly: true,
        }),
        tableField({
          name: "taskTable",
          position: { x: 0, y: 48 },
          width: 267,
          height: 132,
          showHead: true,
          content: JSON.stringify([["1", "Team Member", "#1", "Sample Task\nRemark text", "Pending", "Team Member", "Start 01-01-2026\nEnd 05-01-2026", "3"]]),
          head: TASK_TABLE_COLUMNS.map((c) => c.label),
          headWidthPercentages: TASK_TABLE_COLUMNS.map((c) => c.widthPct),
          headStyles: { backgroundColor: "#f8f9fa", fontColor: "#000000", fontSize: 8, alignment: "left", padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } },
          bodyStyles: { fontSize: 7.5, alignment: "left", padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } },
          columnStyles,
          visibilityCondition: { mode: "compare", field: "hasTasks", operator: "equals", value: "1" },
        }),
        textField({
          name: "noDataText",
          position: { x: 0, y: 48 },
          width: 267,
          height: 6,
          fontSize: 9,
          alignment: "center",
          content: "No due task found",
          visibilityCondition: { mode: "compare", field: "hasTasks", operator: "equals", value: "" },
        }),
        textField({
          name: "pageNumber",
          position: { x: 247, y: 195 },
          width: 20,
          height: 5,
          fontSize: 8,
          alignment: "right",
          content: "{currentPage}/{totalPages}",
          readOnly: true,
        }),
      ],
    ],
  };
}
