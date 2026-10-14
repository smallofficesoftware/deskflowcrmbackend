// Job Card documents (ticket #2212) — 4 kinds, ported from the fixed EJS
// views under views/job-card/: jobCardPrint.ejs, jobCardMasterPrint.ejs,
// requiredMaterialPrint.ejs, productionEntryReceipt.ejs. Each kind is its
// own doc_type/builder, same "non-cart system document" tier as
// shippingLabel/taskDueList/accountStatement — not part of templates.js's
// cart-shaped DOC_TYPES.
//
// The EJS master/required-material views render one heading + one table PER
// BOM process. Same flattening choice taskDueListTemplate.js already made
// for its own per-team tables: pdfme's table field has no dynamic-count-of
// -tables construct, so this flattens every process's rows into ONE table
// with a "Process" column added instead (process name repeated per row).
import { tableField, textField } from "./buildTemplate.js";

const PAGE = { width: 210, height: 297 }; // A4 portrait
const MARGIN = 10;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

function headerFields() {
  return [
    textField({ name: "companyName", position: { x: 0, y: 0 }, width: CONTENT_WIDTH, height: 7, fontSize: 12, fontName: "Poppins Bold", alignment: "center", content: "", visibilityCondition: { mode: "hideIfEmpty" } }),
    textField({ name: "companyAddress", position: { x: 0, y: 7 }, width: CONTENT_WIDTH, height: 6, fontSize: 8, alignment: "center", lineHeight: 1.3, content: "", visibilityCondition: { mode: "hideIfEmpty" } }),
    textField({ name: "companyContactLine", position: { x: 0, y: 13 }, width: CONTENT_WIDTH, height: 5, fontSize: 8, alignment: "center", content: "", visibilityCondition: { mode: "hideIfEmpty" } }),
    textField({ name: "companyGSTIN", position: { x: 0, y: 18 }, width: CONTENT_WIDTH, height: 5, fontSize: 8, alignment: "center", content: "", visibilityCondition: { mode: "hideIfEmpty" } }),
    textField({ name: "divider", position: { x: 0, y: 24 }, width: CONTENT_WIDTH, height: 0.3, backgroundColor: "#000000", content: "", readOnly: true }),
  ];
}

function labelValueRow(y, labelName, labelText, valueName, x = 0, width = CONTENT_WIDTH / 2) {
  return [
    textField({ name: labelName, position: { x, y }, width: 30, height: 5, fontSize: 8, fontName: "Poppins Bold", content: labelText, readOnly: true }),
    textField({ name: valueName, position: { x: x + 30, y }, width: width - 30, height: 5, fontSize: 8, content: "" }),
  ];
}

const MATERIAL_TABLE_COLUMNS = [
  { key: "process", label: "Process", widthPct: 13 },
  { key: "type", label: "Type", widthPct: 10 },
  { key: "material", label: "Material", widthPct: 24 },
  { key: "required", label: "Required", widthPct: 12 },
  { key: "available", label: "Available", widthPct: 12 },
  { key: "consumed", label: "Consumed/Rejected", widthPct: 15 },
  { key: "diff", label: "Shortage/Diff", widthPct: 14 },
];

function materialTableField(name, y, height) {
  return tableField({
    name,
    position: { x: 0, y },
    width: CONTENT_WIDTH,
    height,
    showHead: true,
    content: JSON.stringify([["Process 1", "Consumption", "Sample Material (pcs)", "10.000", "8.000", "2.000", "-2.000"]]),
    head: MATERIAL_TABLE_COLUMNS.map((c) => c.label),
    headWidthPercentages: MATERIAL_TABLE_COLUMNS.map((c) => c.widthPct),
    headStyles: { backgroundColor: "#f8f9fa", fontColor: "#000000", fontSize: 8, alignment: "left" },
    bodyStyles: { fontSize: 7.5, alignment: "left" },
    columnStyles: { 3: { alignment: "right" }, 4: { alignment: "right" }, 5: { alignment: "right" }, 6: { alignment: "right" } },
  });
}

// jobCard: customer details + item details — same 2 blocks as jobCardPrint.ejs.
export function buildJobCardTemplate() {
  return {
    basePdf: { width: PAGE.width, height: PAGE.height, padding: [MARGIN, MARGIN, MARGIN, MARGIN] },
    schemas: [
      [
        ...headerFields(),
        textField({ name: "docTitle", position: { x: 0, y: 28 }, width: CONTENT_WIDTH, height: 7, fontSize: 13, fontName: "Poppins Bold", alignment: "center", content: "JOB CARD" }),
        textField({ name: "jobCardNoText", position: { x: 0, y: 36 }, width: CONTENT_WIDTH, height: 5, fontSize: 9, alignment: "center", content: "Job Card #" }),

        textField({ name: "customerSectionTitle", position: { x: 0, y: 46 }, width: CONTENT_WIDTH, height: 5, fontSize: 9, fontName: "Poppins Bold", content: "Customer Details", readOnly: true }),
        ...labelValueRow(53, "customerNameLabel", "Customer:", "customerName"),
        ...labelValueRow(53, "customerPhoneLabel", "Phone:", "customerPhone", CONTENT_WIDTH / 2),
        ...labelValueRow(60, "customerEmailLabel", "Email:", "customerEmail"),
        ...labelValueRow(60, "customerGSTINLabel", "GST No:", "customerGSTIN", CONTENT_WIDTH / 2),
        ...labelValueRow(67, "customerAddressLabel", "Address:", "customerAddress"),

        textField({ name: "itemSectionTitle", position: { x: 0, y: 80 }, width: CONTENT_WIDTH, height: 5, fontSize: 9, fontName: "Poppins Bold", content: "Item Details", readOnly: true }),
        ...labelValueRow(87, "itemNameLabel", "Item:", "itemName"),
        ...labelValueRow(87, "itemCodeLabel", "Code:", "itemCode", CONTENT_WIDTH / 2),
        ...labelValueRow(94, "orderNoLabel", "Order No:", "orderNo"),
        ...labelValueRow(94, "deliveryDateLabel", "Delivery:", "deliveryDate", CONTENT_WIDTH / 2),
        textField({ name: "orderQtyLine", position: { x: 0, y: 101 }, width: CONTENT_WIDTH, height: 6, fontSize: 10, fontName: "Poppins Bold", content: "" }),
      ],
    ],
  };
}

// jobCardMaster: customer/item summary + flattened materials table + production history table.
export function buildJobCardMasterTemplate() {
  return {
    basePdf: { width: PAGE.width, height: PAGE.height, padding: [MARGIN, MARGIN, MARGIN, MARGIN] },
    schemas: [
      [
        ...headerFields(),
        textField({ name: "docTitle", position: { x: 0, y: 28 }, width: CONTENT_WIDTH, height: 7, fontSize: 13, fontName: "Poppins Bold", alignment: "center", content: "MASTER JOB CARD REPORT" }),
        textField({ name: "jobCardNoText", position: { x: 0, y: 36 }, width: CONTENT_WIDTH, height: 5, fontSize: 9, alignment: "center", content: "Job Card #" }),

        ...labelValueRow(44, "customerNameLabel", "Customer:", "customerName"),
        ...labelValueRow(44, "customerPhoneLabel", "Phone:", "customerPhone", CONTENT_WIDTH / 2),
        ...labelValueRow(51, "itemLineLabel", "Item:", "itemLine"),
        ...labelValueRow(51, "orderNoLabel", "Order No:", "orderNo", CONTENT_WIDTH / 2),
        ...labelValueRow(58, "targetQtyLabel", "Target Qty:", "targetQtyLine"),
        ...labelValueRow(58, "totalProducedLabel", "Produced:", "totalProducedLine", CONTENT_WIDTH / 2),

        textField({ name: "materialsSectionTitle", position: { x: 0, y: 68 }, width: CONTENT_WIDTH, height: 5, fontSize: 9, fontName: "Poppins Bold", content: "Required Materials", readOnly: true }),
        materialTableField("materialsTable", 74, 70),
        textField({ name: "materialsNoDataText", position: { x: 0, y: 74 }, width: CONTENT_WIDTH, height: 6, fontSize: 8, alignment: "center", content: "No required materials recorded.", visibilityCondition: { mode: "compare", field: "hasMaterials", operator: "equals", value: "" } }),

        textField({ name: "historySectionTitle", position: { x: 0, y: 148 }, width: CONTENT_WIDTH, height: 5, fontSize: 9, fontName: "Poppins Bold", content: "Production History", readOnly: true }),
        tableField({
          name: "historyTable",
          position: { x: 0, y: 154 },
          width: CONTENT_WIDTH,
          height: 70,
          showHead: true,
          content: JSON.stringify([["#1", "01-01-2026", "5", "2", "0", "-"]]),
          head: ["Entry ID", "Date", "Produced Qty", "Consumption Items", "Rejection Items", "Remark"],
          headWidthPercentages: [12, 18, 16, 20, 18, 16],
          headStyles: { backgroundColor: "#f8f9fa", fontColor: "#000000", fontSize: 8, alignment: "left" },
          bodyStyles: { fontSize: 7.5, alignment: "left" },
          columnStyles: { 2: { alignment: "right" }, 3: { alignment: "right" }, 4: { alignment: "right" } },
        }),
        textField({ name: "historyNoDataText", position: { x: 0, y: 154 }, width: CONTENT_WIDTH, height: 6, fontSize: 8, alignment: "center", content: "No production entries recorded yet.", visibilityCondition: { mode: "compare", field: "hasHistory", operator: "equals", value: "" } }),
      ],
    ],
  };
}

// requiredMaterial: item line + flattened materials table only.
export function buildRequiredMaterialTemplate() {
  return {
    basePdf: { width: PAGE.width, height: PAGE.height, padding: [MARGIN, MARGIN, MARGIN, MARGIN] },
    schemas: [
      [
        ...headerFields(),
        textField({ name: "docTitle", position: { x: 0, y: 28 }, width: CONTENT_WIDTH, height: 7, fontSize: 13, fontName: "Poppins Bold", alignment: "center", content: "REQUIRED MATERIAL" }),
        textField({ name: "jobCardNoText", position: { x: 0, y: 36 }, width: CONTENT_WIDTH, height: 5, fontSize: 9, alignment: "center", content: "Job Card #" }),
        textField({ name: "itemLine", position: { x: 0, y: 44 }, width: CONTENT_WIDTH, height: 5, fontSize: 9, fontName: "Poppins Bold", content: "" }),
        materialTableField("materialsTable", 52, 160),
      ],
    ],
  };
}

// productionEntryReceipt: job/entry info block + consumed/rejected materials tables.
export function buildProductionEntryReceiptTemplate() {
  return {
    basePdf: { width: PAGE.width, height: PAGE.height, padding: [MARGIN, MARGIN, MARGIN, MARGIN] },
    schemas: [
      [
        ...headerFields(),
        textField({ name: "docTitle", position: { x: 0, y: 28 }, width: CONTENT_WIDTH, height: 7, fontSize: 13, fontName: "Poppins Bold", alignment: "center", content: "PRODUCTION ENTRY RECEIPT" }),

        ...labelValueRow(38, "jobCardNoLabel", "Job Card:", "jobCardNoText"),
        ...labelValueRow(38, "entryIdLabel", "Entry ID:", "entryIdText", CONTENT_WIDTH / 2),
        ...labelValueRow(45, "itemNameLabel", "Item:", "itemName"),
        ...labelValueRow(45, "entryDateLabel", "Date:", "entryDateText", CONTENT_WIDTH / 2),
        ...labelValueRow(52, "producedQtyLabel", "Produced:", "producedQtyText"),
        ...labelValueRow(52, "remarkLabel", "Remark:", "remarkText", CONTENT_WIDTH / 2),

        textField({ name: "consumedSectionTitle", position: { x: 0, y: 62 }, width: CONTENT_WIDTH, height: 5, fontSize: 9, fontName: "Poppins Bold", content: "Consumed Materials", readOnly: true }),
        tableField({
          name: "consumedTable",
          position: { x: 0, y: 68 },
          width: CONTENT_WIDTH,
          height: 55,
          showHead: true,
          content: JSON.stringify([["Sample Material", "1", "2 pcs"]]),
          head: ["Material Name", "Process ID", "Consumed Qty"],
          headWidthPercentages: [50, 20, 30],
          headStyles: { backgroundColor: "#f8f9fa", fontColor: "#000000", fontSize: 8, alignment: "left" },
          bodyStyles: { fontSize: 8, alignment: "left" },
          columnStyles: { 2: { alignment: "right" } },
        }),

        textField({ name: "rejectedSectionTitle", position: { x: 0, y: 128 }, width: CONTENT_WIDTH, height: 5, fontSize: 9, fontName: "Poppins Bold", content: "Rejected/Scrap Materials", readOnly: true }),
        tableField({
          name: "rejectedTable",
          position: { x: 0, y: 134 },
          width: CONTENT_WIDTH,
          height: 55,
          showHead: true,
          content: JSON.stringify([["Sample Material", "1", "1 pcs"]]),
          head: ["Material Name", "Process ID", "Rejected Qty"],
          headWidthPercentages: [50, 20, 30],
          headStyles: { backgroundColor: "#f8f9fa", fontColor: "#000000", fontSize: 8, alignment: "left" },
          bodyStyles: { fontSize: 8, alignment: "left" },
          columnStyles: { 2: { alignment: "right" } },
        }),
      ],
    ],
  };
}
