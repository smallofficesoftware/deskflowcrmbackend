// Single account-transaction receipt (accountPDFv1.ejs port) — an 80mm
// thermal-receipt-shaped doc.
//
// Fixed field positions (like accountStatementTemplate.js / buildTemplate.js's
// cart-doc buyer block), not the previous "running cursor sized from real
// content" approach — that computed every field's Y from the actual line
// counts on hand at generation time, which is exactly wrong for a company's
// own SAVED customization: the frozen JSON keeps whatever Y positions its
// original content happened to produce, so a later receipt with more/fewer
// lines than that one either overlaps the next section or leaves it
// stranded with a gap.
//
// Still built with a running cursor (below) so the row spacing math stays
// in one place, but the cursor now advances by a FIXED assumed-max height
// per row every time, never a real measured one — same output on every
// call, whether pdfme is building it fresh or replaying a company's frozen
// JSON. Optional rows use hideIfEmpty (a gap where a company left a field
// blank) and optional SECTIONS use a flag input (showHeader/showContact/
// showRemark) instead of being omitted from the schema entirely — every
// field is always present and independently movable in the Designer
// canvas. rowH() is the same fontSize*lineHeight*mmPerPt*1.3-safety-margin
// formula accountStatementTemplate.js uses (pdfme does NOT clip text to a
// field's declared height — text taller than its box draws past it into
// whatever comes next, confirmed by an actual render of the first cut of
// this rewrite, which used flat spacing and visibly overlapped).
import { textField } from "./buildTemplate.js";

const PAGE_WIDTH = 80; // mm, matches the old 80mm thermal-receipt @page width
const MARGIN_X = 4;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const PT_TO_MM = 0.3528;
function rowH(fontSize, lineHeight = 1.4) {
  return fontSize * lineHeight * PT_TO_MM * 1.3;
}
const GAP = 2;

function hideIfEmpty(name) {
  return { dataSource: name, visibilityCondition: { mode: "hideIfEmpty" } };
}
function showWhenFlag(name, flagField) {
  return { dataSource: name, visibilityCondition: { mode: "compare", field: flagField, operator: "equals", value: "1" } };
}

export function buildAccountTransactionTemplate() {
  const fields = [];
  let y = 0;
  const push = (field) => fields.push(field);

  const divider = (name, flagField) => {
    push(textField({
      name, position: { x: MARGIN_X, y }, width: CONTENT_WIDTH, height: 0.3,
      backgroundColor: "#000000", content: "", readOnly: true,
      ...(flagField ? showWhenFlag(name, flagField) : {}),
    }));
    y += GAP;
  };

  const sectionTitle = (name, content, flagField) => {
    const h = rowH(10);
    push(textField({
      name, position: { x: MARGIN_X, y }, width: CONTENT_WIDTH, height: h,
      fontSize: 10, fontName: "Poppins Bold", alignment: "center", content,
      readOnly: name !== "thankYouText",
      ...(flagField ? showWhenFlag(name, flagField) : {}),
    }));
    y += h + GAP;
  };

  // plain: true -> always visible, no hideIfEmpty/flag binding at all
  // (matches the old unconditional amountLine behavior).
  const textRow = (name, fontSize, opts = {}) => {
    const h = opts.tall ? rowH(fontSize) * 1.8 : rowH(fontSize);
    push(textField({
      name, position: { x: MARGIN_X, y }, width: CONTENT_WIDTH, height: h,
      fontSize, lineHeight: 1.4, content: opts.content ?? "",
      ...(opts.overrides || {}),
      ...(opts.plain ? {} : opts.flagField ? showWhenFlag(name, opts.flagField) : hideIfEmpty(name)),
    }));
    y += h;
    return h;
  };

  const labelValueRow = (labelName, valueName, flagField) => {
    const h = rowH(8.5);
    push(textField({
      name: labelName, position: { x: MARGIN_X, y }, width: 36, height: h,
      fontSize: 8.5, fontName: "Poppins Bold", lineHeight: 1.4, content: "",
      ...(flagField ? showWhenFlag(labelName, flagField) : hideIfEmpty(labelName)),
    }));
    push(textField({
      name: valueName, position: { x: MARGIN_X + 36, y }, width: 36, height: h,
      fontSize: 8.5, alignment: "right", lineHeight: 1.4, content: "",
      ...(flagField ? showWhenFlag(valueName, flagField) : hideIfEmpty(valueName)),
    }));
    y += h;
  };

  // Company header block — gaps appear where a company left companyContact/
  // companyGSTIN blank, section shows/hides as a whole via showHeader.
  textRow("companyName", 15, { flagField: "showHeader", content: "COMPANY NAME", overrides: { fontName: "Poppins Bold", alignment: "center" } });
  textRow("companyAddress", 7.5, { flagField: "showHeader", tall: true, overrides: { alignment: "center" } });
  textRow("companyContact", 7.5, { flagField: "showHeader", overrides: { alignment: "center" } });
  textRow("companyGSTIN", 7.5, { flagField: "showHeader", overrides: { alignment: "center" } });
  y += GAP;

  divider("divider_1", "showContact");
  sectionTitle("contactSectionTitle", "Contact Details", "showContact");
  divider("divider_2", "showContact");
  labelValueRow("contactNameLabel", "contactNameValue", "showContact");
  labelValueRow("contactMobileLabel", "contactMobileValue");
  labelValueRow("contactEmailLabel", "contactEmailValue");
  labelValueRow("contactCompanyLabel", "contactCompanyValue");
  labelValueRow("contactCountryLabel", "contactCountryValue");
  labelValueRow("contactStateLabel", "contactStateValue");
  labelValueRow("contactCityLabel", "contactCityValue");
  labelValueRow("contactPincodeLabel", "contactPincodeValue");
  labelValueRow("contactAddressLabel", "contactAddressValue");
  y += GAP;

  divider("divider_3");
  sectionTitle("txnSectionTitle", "Account Transaction");
  divider("divider_4");
  labelValueRow("txnIdLabel", "txnIdValue");
  labelValueRow("entityLabel", "entityValue");
  y += GAP;

  textRow("amountLine", 12, {
    plain: true,
    content: "₹ 0.00 (Credit)",
    overrides: { fontName: "Poppins Bold", alignment: "right", fontColor: "#008000" },
  });
  y += GAP;

  labelValueRow("paymentDateLabel", "paymentDateValue");
  labelValueRow("paymentModeLabel", "paymentModeValue");
  y += GAP;

  textRow("remarkText", 8.5, { flagField: "showRemark", tall: true, overrides: { fontName: "Poppins Bold", fontColor: "#1b1bb3" } });
  y += GAP;

  divider("divider_5");
  sectionTitle("thankYouText", "Thank You!");

  return {
    basePdf: { width: PAGE_WIDTH, height: Math.ceil(y + 6), padding: [6, 0, 6, 0] },
    schemas: [fields],
  };
}
