// Single account-transaction receipt (accountPDFv1.ejs port) — an 80mm
// thermal-receipt-shaped doc, not the A4 invoice layout. Own doc shape, not
// registered in templates.js's DOC_TYPES (no Designer customization for
// this one yet, fixed port only).
//
// The EJS lays out each optional section as a 2-column label/value HTML
// table (label left, value right, only rows whose data exists get a <tr>
// at all) with a VARIABLE row count (0-8 contact rows depending on which
// fields the contact actually has). A static template with hardcoded y
// positions can't fit that — text overflows its declared height silently
// (pdfme draws past a field's `height`, it isn't a clip box) and collides
// with whatever comes next. So this builds the schema with a running
// vertical cursor instead, sized from each block's REAL line count, and
// is called at generate time (accountTransactionGenerate.js) once the real
// row counts are known — not a fixed Designer-editable layout.
import { textField } from "./buildTemplate.js";

const PAGE_WIDTH = 80; // mm, matches the old 80mm thermal-receipt @page width
const MARGIN_X = 4;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

// pdfme fontSize is in pt, position/width/height in mm — 1pt = 0.3528mm.
// +15% safety margin on top of the raw conversion — measured mm/line has
// run short of the real rendered line spacing in practice (see
// accountStatementTemplate.js), so every field sized off this is padded.
const PT_TO_MM = 0.3528;
function lineHeightMM(fontSize, lineHeight) {
  return fontSize * lineHeight * PT_TO_MM * 1.15;
}

export function buildAccountTransactionTemplate({
  headerLineCount,
  contactRowCount,
  remarkLineCount,
}) {
  const fields = [];
  let y = 0;

  const push = (field) => fields.push(field);

  if (headerLineCount > 0) {
    push(
      textField({
        name: "companyName",
        position: { x: MARGIN_X, y },
        width: CONTENT_WIDTH,
        height: lineHeightMM(15, 1.2),
        fontSize: 15,
        fontName: "Poppins Bold",
        alignment: "center",
        content: "COMPANY NAME",
      }),
    );
    y += lineHeightMM(15, 1.2) + 1;

    const line2Height = lineHeightMM(7.5, 1.3) * (headerLineCount - 1);
    push(
      textField({
        name: "companyHeaderLine2",
        position: { x: MARGIN_X, y },
        width: CONTENT_WIDTH,
        height: line2Height,
        fontSize: 7.5,
        alignment: "center",
        lineHeight: 1.3,
        content: "",
      }),
    );
    y += line2Height + 2;
  }

  if (contactRowCount > 0) {
    y = pushDivider(fields, y);
    y = pushSectionTitle(fields, "contactSectionTitle", "Contact Details", y);
    y = pushDivider(fields, y);
    y = pushLabelValuePair(fields, "contactLabels", "contactValues", y, contactRowCount);
    y += 3;
  }

  y = pushDivider(fields, y);
  y = pushSectionTitle(fields, "txnSectionTitle", "Account Transaction", y);
  y = pushDivider(fields, y);
  y = pushLabelValuePair(fields, "txnLabelsTop", "txnValuesTop", y, 2);
  y += 3;

  push(
    textField({
      name: "amountLine",
      position: { x: MARGIN_X, y },
      width: CONTENT_WIDTH,
      height: lineHeightMM(12, 1.2),
      fontSize: 12,
      fontName: "Poppins Bold",
      alignment: "right",
      fontColor: "#008000",
      content: "₹ 0.00 (Credit)",
    }),
  );
  y += lineHeightMM(12, 1.2) + 3;

  y = pushLabelValuePair(fields, "txnLabelsBottom", "txnValuesBottom", y, 2);
  y += 3;

  if (remarkLineCount > 0) {
    const remarkHeight = lineHeightMM(8.5, 1.3) * remarkLineCount;
    push(
      textField({
        name: "remarkText",
        position: { x: MARGIN_X, y },
        width: CONTENT_WIDTH,
        height: remarkHeight,
        fontSize: 8.5,
        fontName: "Poppins Bold",
        fontColor: "#1b1bb3",
        lineHeight: 1.3,
        content: "",
      }),
    );
    y += remarkHeight + 3;
  }

  y = pushDivider(fields, y);
  y = pushSectionTitle(fields, "thankYouText", "Thank You!", y);
  y += 4;

  return {
    basePdf: { width: PAGE_WIDTH, height: Math.max(y + 6, 60), padding: [6, 0, 6, 0] },
    schemas: [fields],
  };
}

function pushDivider(fields, y) {
  fields.push(
    textField({
      name: `divider_${fields.length}`,
      position: { x: MARGIN_X, y },
      width: CONTENT_WIDTH,
      height: 0.3,
      backgroundColor: "#000000",
      content: "",
      readOnly: true,
    }),
  );
  return y + 2.5;
}

function pushSectionTitle(fields, name, content, y) {
  const h = lineHeightMM(10, 1.2);
  fields.push(
    textField({
      name,
      position: { x: MARGIN_X, y },
      width: CONTENT_WIDTH,
      height: h,
      fontSize: 10,
      fontName: "Poppins Bold",
      alignment: "center",
      content,
      readOnly: name !== "thankYouText" ? false : true,
    }),
  );
  return y + h + 2.5;
}

function pushLabelValuePair(fields, labelName, valueName, y, rowCount) {
  const h = lineHeightMM(8.5, 1.6) * rowCount;
  fields.push(
    textField({
      name: labelName,
      position: { x: MARGIN_X, y },
      width: 36,
      height: h,
      fontSize: 8.5,
      fontName: "Poppins Bold",
      lineHeight: 1.6,
      content: "",
    }),
    textField({
      name: valueName,
      position: { x: MARGIN_X + 36, y },
      width: 36,
      height: h,
      fontSize: 8.5,
      alignment: "right",
      lineHeight: 1.6,
      content: "",
    }),
  );
  return y + h;
}
