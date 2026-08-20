// Shipping label is its own doc shape — a small A5 courier label (TO/FROM +
// QR + optional item list), not the A4 invoice layout buildTemplate.js's
// buildDocTemplate() builds. Not registered in templates.js's DOC_TYPES /
// document_print_templates — no per-company Designer customization for this
// one yet, just a fixed pdfme-rendered port of shippingLabel.ejs. Reuses
// textField/imageField/tableField from buildTemplate.js so it's built on the
// same real plugin defaultSchema, not a second copy of that logic.
import { imageField, tableField, textField } from "./buildTemplate.js";

const PAGE = { width: 148, height: 210 }; // A5 portrait, matches the old pdf-creator-node options.format

export function buildShippingLabelTemplate() {
  return {
    basePdf: { width: PAGE.width, height: PAGE.height, padding: [8, 8, 8, 8] },
    schemas: [
      [
        textField({
          name: "toLabel",
          position: { x: 8, y: 8 },
          width: 60,
          height: 6,
          fontSize: 13,
          fontName: "Poppins Bold",
          content: "TO",
          readOnly: true,
        }),
        textField({
          name: "toCustomerName",
          position: { x: 8, y: 15 },
          width: 132,
          height: 5,
          fontSize: 10,
          fontName: "Poppins Bold",
          content: "Customer Name",
        }),
        textField({
          name: "toAddress",
          position: { x: 8, y: 21 },
          width: 132,
          height: 12,
          fontSize: 9,
          lineHeight: 1.3,
          content: "Shipping address, City, State - PIN",
        }),
        textField({
          name: "toPhone",
          position: { x: 8, y: 34 },
          width: 132,
          height: 5,
          fontSize: 9,
          content: "Phone: 9876543210",
          // Old EJS only prints this line at all when cart.to_customer_phone
          // is set (no "Phone:" label shown otherwise) — same behavior here.
          visibilityCondition: { mode: "hideIfEmpty" },
        }),

        // <hr> divider — a hairline rectangle-shaped text field (no borderless
        // line primitive wired into pluginMap for this template's own
        // generate call, a filled 0.2mm-tall box reads the same on paper).
        textField({
          name: "divider",
          position: { x: 8, y: 41 },
          width: 132,
          height: 0.3,
          backgroundColor: "#000000",
          content: "",
          readOnly: true,
        }),

        textField({
          name: "fromLabel",
          position: { x: 8, y: 45 },
          width: 60,
          height: 6,
          fontSize: 13,
          fontName: "Poppins Bold",
          content: "FROM",
          readOnly: true,
        }),
        textField({
          name: "fromCompanyName",
          position: { x: 8, y: 52 },
          width: 95,
          height: 5,
          fontSize: 10,
          fontName: "Poppins Bold",
          content: "Company Name",
        }),
        textField({
          name: "fromAddress",
          position: { x: 8, y: 58 },
          width: 95,
          height: 10,
          fontSize: 9,
          lineHeight: 1.3,
          content: "Company Address, State",
        }),
        textField({
          name: "fromPhone",
          position: { x: 8, y: 69 },
          width: 95,
          height: 5,
          fontSize: 9,
          content: "Phone: 9876543210",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),

        textField({
          name: "orderNumberText",
          position: { x: 100, y: 45 },
          width: 40,
          height: 5,
          fontSize: 8,
          fontName: "Poppins Bold",
          alignment: "right",
          content: "Order #: XXX/00",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
        imageField({
          name: "qrImage",
          position: { x: 108, y: 52 },
          width: 32,
          height: 32,
          content: "",
        }),

        // Product section — old EJS shows the item table + grand total only
        // when printSetting.ProductSection is on (shippingLabel.ejs:73-95).
        // pdfme fields have no single "empty" state for a JSON-stringified
        // table, so both fields gate on the same explicit boolean flag field
        // rather than hideIfEmpty on themselves.
        tableField({
          name: "itemsTable",
          position: { x: 8, y: 90 },
          width: 132,
          height: 40,
          showHead: true,
          content: JSON.stringify([["Sample Item", "1", "100.00"]]),
          head: ["Product", "Qty", "Total"],
          headWidthPercentages: [55, 15, 30],
          headStyles: { backgroundColor: "#ffffff", fontColor: "#000000", fontSize: 8, alignment: "left" },
          bodyStyles: { fontSize: 8 },
          columnStyles: { 1: { alignment: "center" }, 2: { alignment: "right" } },
          visibilityCondition: { mode: "compare", field: "showProductSection", operator: "equals", value: "1" },
        }),
        textField({
          name: "grandTotalText",
          position: { x: 8, y: 132 },
          width: 132,
          height: 6,
          fontSize: 10,
          fontName: "Poppins Bold",
          alignment: "right",
          content: "Grand Total : ₹0.00",
          visibilityCondition: { mode: "compare", field: "showProductSection", operator: "equals", value: "1" },
        }),

        textField({
          name: "termsText",
          position: { x: 8, y: 145 },
          width: 132,
          height: 30,
          fontSize: 8,
          lineHeight: 1.3,
          content: "",
          visibilityCondition: { mode: "hideIfEmpty" },
        }),
      ],
    ],
  };
}
