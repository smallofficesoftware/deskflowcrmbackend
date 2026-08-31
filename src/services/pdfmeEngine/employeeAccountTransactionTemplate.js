// Single employee account-transaction receipt — Team's OWN customization
// slot, deliberately separate from accountTransactionTemplate.js (the
// Contact variant) even though the layout started identical, so a company
// can brand an employee payment receipt differently from a customer one.
// Same 80mm thermal-receipt shape and rowH()/labelValueRow() spacing
// formulas as accountTransactionTemplate.js — see that file's header
// comment for why fixed per-row heights (not measured-from-content) are
// used. "Employee Details" section has only the label/value pairs an
// employee record actually has (name/mobile/email) instead of the contact
// version's 8 (no country/state/city/pincode/address/company for an
// employee).
import { textField } from "./buildTemplate.js";

const PAGE_WIDTH = 80; // mm, matches the 80mm thermal-receipt shape
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

export function buildEmployeeAccountTransactionTemplate() {
  const fields = [];
  // pdfme measures schema position.y from the PAGE's absolute top edge, not
  // from inside basePdf.padding's top margin (confirmed by reading
  // @pdfme/common — a field's own position is never offset by padding) — a
  // cursor starting at 0 renders sitting on the page edge, inside/under the
  // margin guide the Designer draws. Starting at MARGIN_TOP (matching
  // padding[0]/[2] below) clears it; the trailing "+ 6" in basePdf.height
  // below is the matching bottom margin, so top/bottom stay symmetric.
  const MARGIN_TOP = 6;
  let y = MARGIN_TOP;
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

  // plain: true -> always visible, no hideIfEmpty/flag binding at all.
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

  divider("divider_1", "showEmployee");
  sectionTitle("employeeSectionTitle", "Employee Details", "showEmployee");
  divider("divider_2", "showEmployee");
  labelValueRow("employeeNameLabel", "employeeNameValue", "showEmployee");
  labelValueRow("employeeMobileLabel", "employeeMobileValue");
  labelValueRow("employeeEmailLabel", "employeeEmailValue");
  y += GAP;

  divider("divider_3");
  sectionTitle("txnSectionTitle", "Account Transaction");
  divider("divider_4");
  labelValueRow("txnIdLabel", "txnIdValue");
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
