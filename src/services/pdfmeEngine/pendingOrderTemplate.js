// Pending Sales Order / Pending Purchase Order — a fulfillment/outstanding-
// quantity tracker, NOT a priced document. Mirrors the legacy
// PendingPrintViewV1.tsx's actual content: header + buyer/order info (same
// as buildDocTemplate's cart-doc layout, so header-variant selection still
// applies) + a 3-quantity-column items table (ordered / already-invoiced /
// still-pending) + terms + signature — deliberately no HSN/GST summary, no
// grand total, no bank details, since the legacy view has none either (its
// own grandTotalInWords/gstTotalInWords are computed but never rendered).
import {
  buildFooterFields,
  buildHeaderFields,
  FOOTER_BOTTOM_MARGIN,
  imageField,
  shiftFieldY,
  tableField,
  textField,
} from "./buildTemplate.js";

const A4 = { width: 210, height: 297 };

const PENDING_QTY_TABLE_COLUMNS = [
  { key: "no", label: "No.", widthPct: 6, alignment: "center" },
  { key: "description", label: "Particular Description", widthPct: 34, alignment: "left" },
  { key: "orderedQty", label: "Order Qty/Unit", widthPct: 18, alignment: "center" },
  { key: "invoicedQty", label: "Sales Qty/Unit", widthPct: 18, alignment: "center" },
  { key: "pendingQty", label: "Pending Qty/Unit", widthPct: 14, alignment: "center" },
  { key: "rate", label: "Rate", widthPct: 10, alignment: "right" },
];

function buildPendingItemsTableField() {
  const columnStyles = {};
  PENDING_QTY_TABLE_COLUMNS.forEach((c, i) => {
    if (c.alignment !== "left") columnStyles[i] = { alignment: c.alignment };
  });

  return tableField({
    name: "pendingItemsTable",
    position: { x: 10, y: 90 },
    width: 190,
    height: 140,
    showHead: true,
    content: JSON.stringify([
      ["1", "Sample Item\nProduct Code: ABC", "10.00 / Nos", "6.00 / Nos", "4.00 / Nos", "100.00"],
    ]),
    head: PENDING_QTY_TABLE_COLUMNS.map((c) => c.label),
    headWidthPercentages: PENDING_QTY_TABLE_COLUMNS.map((c) => c.widthPct),
    headStyles: {
      backgroundColor: "#cfcfcf",
      fontColor: "#000000",
      fontSize: 7,
      alignment: "center",
      padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
    },
    bodyStyles: {
      fontSize: 7.5,
      alignment: "left",
      padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
    },
    columnStyles,
  });
}

export function buildPendingOrderTemplate(
  docTitle,
  { headerVariant = "details", footerImage = false, headerHeightMM = 18, footerHeightMM = 15 } = {},
) {
  // Kept in sync with buildTemplate.js's buildDocTemplate — both share
  // buildHeaderFields, whose non-image variants now reserve 34mm (was 25)
  // for the added companyGSTIN/companyMobile/companyEmail lines.
  const topPadding = headerVariant === "image" ? Math.max(25, 5 + headerHeightMM + 2) : 34;
  const bottomPadding = footerImage ? Math.max(30, FOOTER_BOTTOM_MARGIN + footerHeightMM + 3) : 15;

  const contentTopOffset = topPadding - 25;
  const applyContentOffset = (field) => shiftFieldY(field, contentTopOffset);

  return {
    basePdf: {
      width: A4.width,
      height: A4.height,
      padding: [topPadding, 10, bottomPadding, 10],
      headerVariant,
      footerImage,
      headerHeightMM,
      footerHeightMM,
      staticSchema: [
        ...buildHeaderFields(headerVariant, headerHeightMM),
        ...buildFooterFields(footerImage, footerHeightMM),
        textField({
          name: "pageNumber",
          position: { x: 180, y: 287 },
          width: 20,
          height: 5,
          fontSize: 8,
          alignment: "right",
          content: "Page {currentPage} of {totalPages}",
          readOnly: true,
        }),
      ],
    },
    schemas: [
      [
        textField({
          name: "docTitle",
          position: { x: 10, y: 25 },
          width: 190,
          height: 6,
          fontSize: 11,
          backgroundColor: "#cfcfcf",
          alignment: "center",
          content: docTitle,
          readOnly: true,
        }),
        textField({
          name: "buyerLabel",
          position: { x: 10, y: 33 },
          width: 95,
          height: 4,
          fontSize: 8,
          content: "TO/BUYER,",
          readOnly: true,
        }),
        textField({
          name: "buyerCompanyName",
          position: { x: 10, y: 37 },
          width: 95,
          height: 4,
          fontSize: 8,
          content: "Customer Company Name",
        }),
        textField({
          name: "buyerContactName",
          position: { x: 10, y: 41 },
          width: 95,
          height: 4,
          fontSize: 8,
          content: "(Customer Contact Name)",
        }),
        textField({
          name: "billingAddressLabel",
          position: { x: 10, y: 45 },
          width: 40,
          height: 4,
          fontSize: 8,
          fontName: "Poppins Bold",
          content: "Billing Address:",
          readOnly: true,
        }),
        textField({
          name: "billingAddress",
          position: { x: 10, y: 49 },
          width: 95,
          height: 8,
          fontSize: 8,
          lineHeight: 1.3,
          content: "123 Street, City, State, PIN",
        }),
        textField({
          name: "orderNumberLabel",
          position: { x: 105, y: 33 },
          width: 22,
          height: 4,
          fontSize: 8,
          fontName: "Poppins Bold",
          content: "Order No.:",
          readOnly: true,
        }),
        textField({
          name: "orderNumber",
          position: { x: 127, y: 33 },
          width: 73,
          height: 4,
          fontSize: 8,
          content: "XXX/00/2026-2027",
        }),
        textField({
          name: "orderDateTimeLabel",
          position: { x: 105, y: 37 },
          width: 26,
          height: 4,
          fontSize: 8,
          fontName: "Poppins Bold",
          content: "Date & Time:",
          readOnly: true,
        }),
        textField({
          name: "orderDateTime",
          position: { x: 131, y: 37 },
          width: 69,
          height: 4,
          fontSize: 8,
          content: "01-01-2026 12:00 PM",
        }),
        textField({
          name: "contactPersonLabel",
          position: { x: 105, y: 41 },
          width: 32,
          height: 4,
          fontSize: 8,
          fontName: "Poppins Bold",
          content: "Contact Person:",
          readOnly: true,
        }),
        textField({
          name: "contactPerson",
          position: { x: 137, y: 41 },
          width: 63,
          height: 4,
          fontSize: 8,
          content: "Team Member Name",
        }),
        buildPendingItemsTableField(),
        textField({
          name: "termsAndConditions",
          position: { x: 10, y: 235 },
          width: 120,
          height: 20,
          fontSize: 7,
          lineHeight: 1.4,
          content: "Terms & Conditions:\n(your terms text)",
        }),
        textField({
          name: "signatureLine",
          position: { x: 140, y: 235 },
          width: 60,
          height: 20,
          fontSize: 8,
          alignment: "right",
          lineHeight: 1.6,
          content: "For, Company Name\n\n(Authorized Signatory)",
        }),
        imageField({
          name: "signatureImage",
          dataSource: "companySignatureImage",
          position: { x: 155, y: 243 },
          width: 40,
          height: 12,
          content: "",
        }),
      ].map(applyContentOffset),
    ],
  };
}
