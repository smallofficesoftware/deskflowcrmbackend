// Default pdfme templates for Custom Form Maker submissions — plan §5.
// Same basePdf/company-header zone every other doc type gets via
// buildDocTemplate() (buildTemplate.js), so a form submission PDF looks
// consistent with the rest of this app's PDF output, not a bespoke layout.
import { buildDocTemplate, tableField, textField } from "./buildTemplate.js";
import { NO_COLUMN_NON_REPEATER_TYPES } from "../form_builder/formBuilderDdlBuilder.js";
import { LAYOUT_TAG_PREFIX, layoutSignature, planPages, printBlocks } from "../form_builder/formBuilderPrintLayout.js";

const A4_HEIGHT = 297;

// Single submission (plan K1): the form's fields grouped into printed blocks —
// a heading with its lines for each section, a real table for a question
// table, a table for each repeater — laid out down as many A4 pages as needed
// (formBuilderPrintLayout.js does the grouping and page planning; the values
// that fill these names come from formSubmissionGenerate.js). The template
// carries `autoLayout`, a tag of the form's structure: a template that still
// has it was generated, not hand-edited, and is rebuilt when the form changes.
// A template edited in Document Designer loses the tag and is left alone.
export function buildDefaultSubmissionTemplate(formTitle, fields) {
  const { basePdf } = buildDocTemplate(formTitle, { headerVariant: "details", footerImage: false });
  const [topPadding, , bottomPadding] = basePdf.padding;
  const bottom = Number((A4_HEIGHT - bottomPadding).toFixed(2));
  const titleY = topPadding;

  // The sign-off lines go before the first repeater (which fills the rest of its page), else at the end.
  const blocks = printBlocks(fields);
  const approvalsBlock = { kind: "text", index: "approvals", title: null, fields: [], fixedHeight: 26, optional: true };
  const firstRepeater = blocks.findIndex((b) => b.kind === "repeater");
  blocks.splice(firstRepeater === -1 ? blocks.length : firstRepeater, 0, approvalsBlock);
  const pages = planPages(blocks, { top: topPadding, firstTop: titleY + 12, bottom });

  const schemas = pages.map((page, pageIndex) => {
    const row = [];
    if (pageIndex === 0) {
      row.push(
        textField({
          name: "submissionTitle",
          dataSource: "submissionTitle",
          position: { x: 10, y: titleY },
          width: 190,
          height: 8,
          fontSize: 13,
          fontName: "Poppins Bold",
          alignment: "center",
          content: formTitle,
        }),
      );
    }
    for (const item of page.items) {
      const { block, y, height } = item;
      if (block.kind === "text") {
        const name = String(block.index);
        if (block.title) {
          row.push(
            textField({
              name: `blk_${name}_title`,
              dataSource: `blk_${name}_title`,
              position: { x: 10, y },
              width: 190,
              height: 6,
              fontSize: 10,
              fontName: "Poppins Bold",
              content: block.title,
            }),
          );
        }
        if (item.bodyHeight > 0) {
          const bodyName = block.index === "approvals" ? "approvals_body" : `blk_${name}_body`;
          row.push(
            textField({
              name: bodyName,
              dataSource: bodyName,
              position: { x: 10, y: y + (item.titleHeight || 0) },
              width: 190,
              height: item.bodyHeight,
              fontSize: 9,
              alignment: "left",
              content: "",
              dynamicFontSize: { min: 6, max: 9, fit: "vertical" },
              ...(block.optional ? { visibilityCondition: { mode: "hideIfEmpty" } } : {}),
            }),
          );
        }
      } else if (block.kind === "qtable") {
        const field = block.field;
        const answerCols = Array.isArray(field.answer_columns) && field.answer_columns.length ? field.answer_columns : [{ key: "answer", label: "Answer" }];
        const head = ["No.", "Question", ...answerCols.map((c) => c.label || c.key)];
        const rest = Number((42 / answerCols.length).toFixed(2));
        row.push(
          textField({
            name: `${field.key}_qtable_heading`,
            dataSource: `${field.key}_qtable_heading`,
            position: { x: 10, y },
            width: 190,
            height: 6,
            fontSize: 10,
            fontName: "Poppins Bold",
            content: field.label || field.key,
          }),
          tableField({
            name: `${field.key}_qtable`,
            dataSource: `${field.key}_qtable`,
            position: { x: 10, y: y + 8 },
            width: 190,
            height,
            showHead: true,
            head,
            headWidthPercentages: [8, 50, ...answerCols.map(() => rest)],
            content: JSON.stringify([head.map(() => "")]),
          }),
        );
      } else if (block.kind === "repeater") {
        const repeater = block.field;
        const columns = (repeater.columns || []).filter((c) => !NO_COLUMN_NON_REPEATER_TYPES.has(c.type));
        const colCount = Math.max(columns.length, 1);
        const widthPct = Array(colCount).fill(Number((100 / colCount).toFixed(2)));
        row.push(
          textField({
            name: `${repeater.key}_heading`,
            dataSource: `${repeater.key}_heading`,
            position: { x: 10, y },
            width: 190,
            height: 6,
            fontSize: 10,
            fontName: "Poppins Bold",
            content: repeater.label || repeater.key,
          }),
          tableField({
            name: `${repeater.key}_table`,
            dataSource: `${repeater.key}_table`,
            position: { x: 10, y: y + 8 },
            width: 190,
            height: Math.max(height, 20),
            showHead: true,
            head: columns.map((c) => c.label || c.key),
            headWidthPercentages: widthPct,
            content: JSON.stringify([columns.map(() => "")]),
          }),
        );
      }
    }
    return row;
  });

  return { basePdf, schemas, autoLayout: `${LAYOUT_TAG_PREFIX}${layoutSignature(fields)}` };
}

// Bulk submissions: title + one full table, same shape as Report Builder's
// buildDefaultReportTemplate (reportPdfExport.js) — kept structurally
// identical rather than reinvented.
export function buildBulkSubmissionsTemplate(title, columns) {
  const colCount = Math.max(columns.length, 1);
  const widthPct = Array(colCount).fill(Number((100 / colCount).toFixed(2)));

  const { basePdf } = buildDocTemplate(title, { headerVariant: "details", footerImage: false });
  const [topPadding, , bottomPadding] = basePdf.padding;
  const titleY = topPadding;
  const tableY = titleY + 12;

  return {
    basePdf,
    schemas: [
      [
        textField({
          name: "bulkTitle",
          dataSource: "bulkTitle",
          position: { x: 10, y: titleY },
          width: 190,
          height: 8,
          fontSize: 13,
          fontName: "Poppins Bold",
          alignment: "center",
          content: title,
        }),
        tableField({
          name: "bulkTable",
          dataSource: "bulkTable",
          position: { x: 10, y: tableY },
          width: 190,
          height: Number((A4_HEIGHT - tableY - bottomPadding).toFixed(2)),
          showHead: true,
          head: columns.map((c) => c.label),
          headWidthPercentages: widthPct,
          content: JSON.stringify([columns.map(() => "")]),
          headStyles: {
            backgroundColor: "#cfcfcf",
            fontColor: "#000000",
            fontSize: 8,
            alignment: "center",
            padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
          },
          bodyStyles: {
            fontSize: 7.5,
            alignment: "left",
            padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
          },
        }),
      ],
    ],
  };
}
