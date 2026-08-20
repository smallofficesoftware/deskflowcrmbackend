// Shared template builder for all DeskflowCRM document types.
// One layout shape (company header + buyer info + item table + totals + signature)
// reused across Quotation / Sales Order / Sales Invoice / Purchase Order / Purchase
// Invoice / Return Sales Invoice / Return Purchase Invoice / Inward / Dispatch /
// Proforma Invoice — only the title text differs per company setting, same as the
// existing EJS templates (dynamicTitle).
//
// Header has 4 mutually-exclusive variants, matching the real app's Puppeteer
// page-header CASE 1-4 in backend/src/services/activities/orderServices.js:
//   image     -> banner image only (settingDetails.headerImage)
//   details   -> company name + address text only (settingDetails.headerDetails)
//   logoLeft  -> logo image left, text right (headerDetailsWithLogo, !headerLogoOnRightSide)
//   logoRight -> text left, logo image right (headerDetailsWithLogo, headerLogoOnRightSide)
// Footer image is a separate, independent toggle (not tied to header variant),
// same as the real app.
//
// pdfme's generate() does NOT auto-fill missing style props the way the Designer
// UI does when you drag a new field onto the canvas — every field here is built on
// top of that plugin's real defaultSchema (from @pdfme/schemas) so partial style
// overrides (e.g. just backgroundColor) don't crash on a missing padding/borderWidth.
//
// Header/logo/footer/signature image fields carry an empty `content` and a
// `dataSource` key instead of baked-in base64 — resolved fresh per request by
// withCompanyHeader() (templates.js) from the real company asset resolution in
// orderServices.js, never stored in the template itself. See the plan's
// "Company header/logo/footer/signature images" decision for why: baking real
// image bytes in here would duplicate them into every saved draft/published/
// version row.
import * as plugins from "@pdfme/schemas";
import { resolveColumns } from "./tableColumns.js";

const A4 = { width: 210, height: 297 };
export const HEADER_VARIANTS = ["image", "details", "logoLeft", "logoRight"];

// docTitle/buyer-info/order-info/itemsTable are hand-positioned assuming the
// header banner ends at y=23 (the default 18mm image variant, or any of the
// fixed-height details/logoLeft/logoRight variants) — a taller configured
// header banner needs these shifted down to clear it. Exported so
// applyTemplateOptions() (templates.js) can apply the SAME shift to an
// already-live/customized template's schemas when just the header height
// changes. totalsBlock/grandTotalWords/termsAndConditions/signatureLine are
// NOT included — they're anchored near the page bottom, independent of
// header height.
export const HEADER_RELATIVE_FIELD_NAMES = new Set([
  "docTitle",
  "originalDuplicate",
  "buyerLabel",
  "buyerCompanyName",
  "buyerContactName",
  "buyerPhoneLabel",
  "buyerPhone",
  "buyerEmailLabel",
  "buyerEmail",
  "billingAddressLabel",
  "billingAddress",
  "shippingAddressLabel",
  "shippingAddress",
  "buyerGSTINLabel",
  "buyerGSTIN",
  "supplyToLabel",
  "supplyTo",
  "orderNumberLabel",
  "orderNumber",
  "orderDateTimeLabel",
  "orderDateTime",
  "contactPersonLabel",
  "contactPerson",
  "itemsTable",
]);

export function shiftFieldY(field, deltaY) {
  return deltaY === 0 || !HEADER_RELATIVE_FIELD_NAMES.has(field.name)
    ? field
    : { ...field, position: { ...field.position, y: field.position.y + deltaY } };
}

// dataSource defaults to the field's own name — a plain, un-duplicated
// field is unaffected (points at itself). It's what makes a RENAMED
// duplicate still resolve to the correct real data: duplicating a field
// copies EVERY property including this one, so the copy keeps pointing at
// the original data key regardless of what it gets renamed to afterward.
// Exported so other doc-shape builders (e.g. shippingLabelTemplate.js, whose
// layout isn't the shared invoice shape below) can build fields against the
// same real plugin defaultSchema instead of duplicating this logic.
export function textField(overrides) {
  return { ...plugins.text.propPanel.defaultSchema, dataSource: overrides.name, ...overrides };
}

export function imageField(overrides) {
  return { ...plugins.image.propPanel.defaultSchema, dataSource: overrides.name, ...overrides };
}

export function tableField(overrides) {
  const base = plugins.table.propPanel.defaultSchema;
  return {
    ...base,
    ...overrides,
    headStyles: { ...base.headStyles, ...(overrides.headStyles || {}) },
    bodyStyles: { ...base.bodyStyles, ...(overrides.bodyStyles || {}) },
    tableStyles: { ...base.tableStyles, ...(overrides.tableStyles || {}) },
    columnStyles: overrides.columnStyles || {},
  };
}

// Builds the header-zone static fields (y=5..23mm) for one variant. Field
// names are variant-specific so withCompanyHeader() (templates.js) can tell
// which text/image field(s) to resolve real company data into.
export function buildHeaderFields(variant, headerHeightMM = 18) {
  switch (variant) {
    case "image":
      return [
        imageField({
          name: "headerImage",
          dataSource: "companyHeaderImage",
          position: { x: 0, y: 5 },
          width: A4.width,
          height: headerHeightMM,
          content: "",
        }),
      ];
    case "logoLeft":
      return [
        imageField({
          name: "headerLogo",
          dataSource: "companyLogo",
          position: { x: 10, y: 5 },
          width: 18,
          height: 18,
          content: "",
        }),
        textField({
          name: "companyDetailsWithLogo",
          position: { x: 32, y: 5 },
          width: 168,
          height: 18,
          fontSize: 8,
          alignment: "left",
          lineHeight: 1.3,
          content:
            "Company Name\nAddress: 123 Street, City, State, PIN\nMo.: 0000000000  Email: company@example.com  GSTIN: 00XXXXX0000X0X0  State: State",
        }),
      ];
    case "logoRight":
      return [
        textField({
          name: "companyDetailsWithLogo",
          position: { x: 10, y: 5 },
          width: 168,
          height: 18,
          fontSize: 8,
          alignment: "left",
          lineHeight: 1.3,
          content:
            "Company Name\nAddress: 123 Street, City, State, PIN\nMo.: 0000000000  Email: company@example.com  GSTIN: 00XXXXX0000X0X0  State: State",
        }),
        imageField({
          name: "headerLogo",
          dataSource: "companyLogo",
          position: { x: 182, y: 5 },
          width: 18,
          height: 18,
          content: "",
        }),
      ];
    case "details":
    default:
      return [
        textField({
          name: "companyName",
          position: { x: 10, y: 5 },
          width: 190,
          height: 8,
          fontSize: 14,
          backgroundColor: "#cfcfcf",
          alignment: "center",
          verticalAlignment: "middle",
        }),
        textField({
          name: "companyAddress",
          position: { x: 10, y: 13 },
          width: 190,
          height: 10,
          fontSize: 8,
          alignment: "center",
          lineHeight: 1.3,
        }),
      ];
  }
}

export const FOOTER_BOTTOM_MARGIN = 12; // reserves room for pageNumber below the footer image

export function buildFooterFields(showFooterImage, footerHeightMM = 15) {
  if (!showFooterImage) return [];
  return [
    imageField({
      name: "footerImage",
      dataSource: "companyFooterImage",
      position: { x: 0, y: A4.height - FOOTER_BOTTOM_MARGIN - footerHeightMM },
      width: A4.width,
      height: footerHeightMM,
      content: "",
    }),
  ];
}

// Builds the itemsTable field for whichever columns are enabled. Column
// count/order here must exactly match orderInputMapper's item-row builder —
// both import resolveColumns() from tableColumns.js as their single source
// of truth so they can't drift apart.
export function buildItemsTableField(columnOptions) {
  const columns = resolveColumns(columnOptions);
  const columnStyles = {};
  columns.forEach((col, i) => {
    if (col.alignment !== "left") columnStyles[i] = { alignment: col.alignment };
  });

  return tableField({
    name: "itemsTable",
    position: { x: 10, y: 90 },
    width: 190,
    height: 75,
    showHead: true,
    // Must match `head`'s column count — this is only the Designer canvas
    // preview's placeholder (real data comes via `inputs` at generate time).
    content: JSON.stringify([
      columns.map((c) => {
        if (c.key === "no") return "1";
        if (c.key === "image") return "";
        if (c.key === "description") return "Sample Item\nProduct Code: ABC";
        if (c.key === "hsn") return "1234";
        if (c.key === "qty") return "1.00 / Nos";
        if (c.key === "discount") return "0.00";
        if (c.key === "cgst" || c.key === "sgst" || c.key === "igst") return "9.00";
        return "100.00";
      }),
    ]),
    head: columns.map((c) => c.label),
    headWidthPercentages: columns.map((c) => c.widthPct),
    // padding: pdfme's cell default is 5mm on every side. With this many
    // optional columns, 10mm of padding eaten from an already-narrow column
    // left almost no room for text. 1.5mm keeps cells readable without crowding.
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
    // Not a real pdfme schema property — pdfme ignores unknown keys, so this
    // rides along as self-describing metadata. Lets the generate flow's image
    // overlay (imageOverlay.js) and the conditional-visibility/watermark
    // steps recover exactly which columns are active straight from the saved
    // template, without a separate request param that could drift out of sync.
    columnOptions: columnOptions || {},
  });
}

export function buildDocTemplate(
  docTitle,
  { headerVariant = "details", footerImage = false, columnOptions = {}, headerHeightMM = 18, footerHeightMM = 15 } = {},
) {
  // Top padding must clear the header banner's actual height (only the
  // "image" variant's height is configurable). Bottom padding must clear the
  // footer banner's actual height plus the pageNumber margin below it.
  const topPadding = headerVariant === "image" ? Math.max(25, 5 + headerHeightMM + 2) : 25;
  const bottomPadding = footerImage ? Math.max(30, FOOTER_BOTTOM_MARGIN + footerHeightMM + 3) : 15;

  const contentTopOffset = topPadding - 25;
  const applyContentOffset = (field) => shiftFieldY(field, contentTopOffset);

  return {
    basePdf: {
      width: A4.width,
      height: A4.height,
      // top/bottom padding must clear the staticSchema header/footer height —
      // pdfme's dynamic-table continuation-page start Y is literally
      // `basePdf.padding[0]`, with ZERO awareness of staticSchema field positions.
      padding: [topPadding, 10, bottomPadding, 10],
      // Not real pdfme properties — pdfme ignores unknown keys. Self-
      // describing metadata so a fresh rebuild for a paper-size change can
      // recover the CURRENT header variant/footer-image state.
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
          width: 145,
          height: 6,
          fontSize: 11,
          backgroundColor: "#cfcfcf",
          alignment: "center",
          content: docTitle,
          readOnly: true,
        }),
        textField({
          name: "originalDuplicate",
          position: { x: 155, y: 25 },
          width: 45,
          height: 6,
          fontSize: 9,
          backgroundColor: "#cfcfcf",
          alignment: "right",
          verticalAlignment: "middle",
          content: "Original",
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
          name: "buyerPhoneLabel",
          position: { x: 10, y: 45 },
          width: 10,
          height: 4,
          fontSize: 8,
          fontName: "Poppins Bold",
          content: "Mo.",
          readOnly: true,
        }),
        textField({
          name: "buyerPhone",
          position: { x: 20, y: 45 },
          width: 85,
          height: 4,
          fontSize: 8,
          content: "9876543210",
        }),
        textField({
          name: "buyerEmailLabel",
          position: { x: 10, y: 49 },
          width: 14,
          height: 4,
          fontSize: 8,
          fontName: "Poppins Bold",
          content: "Email:",
          readOnly: true,
        }),
        textField({
          name: "buyerEmail",
          position: { x: 24, y: 49 },
          width: 81,
          height: 4,
          fontSize: 8,
          content: "customer@example.com",
        }),
        textField({
          name: "billingAddressLabel",
          position: { x: 10, y: 53 },
          width: 40,
          height: 4,
          fontSize: 8,
          fontName: "Poppins Bold",
          content: "Billing Address:",
          readOnly: true,
        }),
        textField({
          name: "billingAddress",
          position: { x: 10, y: 57 },
          width: 95,
          height: 8,
          fontSize: 8,
          lineHeight: 1.3,
          content: "123 Street, City, State, PIN",
        }),
        textField({
          name: "shippingAddressLabel",
          position: { x: 10, y: 65 },
          width: 42,
          height: 4,
          fontSize: 8,
          fontName: "Poppins Bold",
          content: "Shipping Address:",
          readOnly: true,
        }),
        textField({
          name: "shippingAddress",
          position: { x: 10, y: 69 },
          width: 95,
          height: 8,
          fontSize: 8,
          lineHeight: 1.3,
          content: "123 Street, City, State, PIN",
        }),
        textField({
          name: "buyerGSTINLabel",
          position: { x: 10, y: 77 },
          width: 22,
          height: 4,
          fontSize: 8,
          fontName: "Poppins Bold",
          content: "GSTIN No.:",
          readOnly: true,
        }),
        textField({
          name: "buyerGSTIN",
          position: { x: 32, y: 77 },
          width: 73,
          height: 4,
          fontSize: 8,
          content: "00XXXXX0000X0X0",
        }),
        textField({
          name: "supplyToLabel",
          position: { x: 10, y: 81 },
          width: 20,
          height: 4,
          fontSize: 8,
          fontName: "Poppins Bold",
          content: "SupplyTo:",
          readOnly: true,
        }),
        textField({
          name: "supplyTo",
          position: { x: 30, y: 81 },
          width: 75,
          height: 4,
          fontSize: 8,
          content: "State - City",
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
        buildItemsTableField(columnOptions),
        textField({
          name: "totalsBlock",
          position: { x: 105, y: 170 },
          width: 95,
          height: 35,
          fontSize: 9,
          lineHeight: 1.6,
          alignment: "right",
          content: "Sub Total: 0.00\nTotal Amount: 0.00\nGrand Total: 0.00",
        }),
        textField({
          name: "grandTotalWords",
          position: { x: 10, y: 170 },
          width: 90,
          height: 20,
          fontSize: 8,
          lineHeight: 1.4,
          content: "Grand Total In Words: Zero Rupees Only",
        }),
        textField({
          name: "termsAndConditions",
          position: { x: 10, y: 250 },
          width: 120,
          height: 25,
          fontSize: 7,
          lineHeight: 1.4,
          content: "Terms & Conditions:\n(your terms text)",
        }),
        textField({
          name: "signatureLine",
          position: { x: 140, y: 250 },
          width: 60,
          height: 25,
          fontSize: 8,
          alignment: "right",
          lineHeight: 1.6,
          content: "For, Company Name\n\n(Authorized Signatory)",
        }),
        imageField({
          name: "signatureImage",
          dataSource: "companySignatureImage",
          position: { x: 155, y: 258 },
          width: 40,
          height: 12,
          content: "",
        }),
      ].map(applyContentOffset),
    ],
  };
}
