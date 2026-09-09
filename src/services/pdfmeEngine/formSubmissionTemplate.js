// Default pdfme templates for Custom Form Maker submissions — plan §5.
// Same basePdf/company-header zone every other doc type gets via
// buildDocTemplate() (buildTemplate.js), so a form submission PDF looks
// consistent with the rest of this app's PDF output, not a bespoke layout.
import { buildDocTemplate, tableField, textField } from "./buildTemplate.js";

const A4_HEIGHT = 297;

// Single submission: one label/value text block (multi-line — arbitrary
// field counts make a pixel-precise per-field layout impractical for a v1
// default; admin can customize via Document Designer afterward, same as
// every other doc type's default template) plus one table block per
// repeater field.
export function buildDefaultSubmissionTemplate(formTitle, fields) {
  const { basePdf } = buildDocTemplate(formTitle, { headerVariant: "details", footerImage: false });
  const [topPadding, , bottomPadding] = basePdf.padding;
  const titleY = topPadding;
  const detailsY = titleY + 12;

  const repeaters = fields.filter((f) => f.type === "repeater");
  const detailsHeight = repeaters.length > 0 ? 90 : Number((A4_HEIGHT - detailsY - bottomPadding).toFixed(2));

  const schemaRow = [
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
    textField({
      name: "submissionDetails",
      dataSource: "submissionDetails",
      position: { x: 10, y: detailsY },
      width: 190,
      height: detailsHeight,
      fontSize: 9,
      alignment: "left",
      content: "",
    }),
  ];

  let repeaterY = detailsY + detailsHeight + 6;
  for (const repeater of repeaters) {
    const columns = (repeater.columns || []).filter((c) => !["file", "signature", "image", "section-header"].includes(c.type));
    const colCount = Math.max(columns.length, 1);
    const widthPct = Array(colCount).fill(Number((100 / colCount).toFixed(2)));
    const rowHeight = Number((A4_HEIGHT - repeaterY - bottomPadding).toFixed(2));

    schemaRow.push(
      textField({
        name: `${repeater.key}_heading`,
        dataSource: `${repeater.key}_heading`,
        position: { x: 10, y: repeaterY },
        width: 190,
        height: 6,
        fontSize: 10,
        fontName: "Poppins Bold",
        content: repeater.label || repeater.key,
      }),
      tableField({
        name: `${repeater.key}_table`,
        dataSource: `${repeater.key}_table`,
        position: { x: 10, y: repeaterY + 7 },
        width: 190,
        height: Math.max(rowHeight, 20),
        showHead: true,
        head: columns.map((c) => c.label || c.key),
        headWidthPercentages: widthPct,
        content: JSON.stringify([columns.map(() => "")]),
      }),
    );
    repeaterY += rowHeight + 15;
  }

  return { basePdf, schemas: [schemaRow] };
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
