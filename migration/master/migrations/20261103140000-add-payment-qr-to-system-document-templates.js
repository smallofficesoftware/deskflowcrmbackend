/**
 * Migration Name: add-payment-qr-to-system-document-templates
 * Database Type: MASTER
 *
 * The UPI "Scan to Pay" QR used to be added by code at a fixed spot (x 10, y 220) when a document was printed.
 * It is now printed only where a template has a `paymentQR` image field (plus a `paymentQRLabel` "Scan to Pay"
 * text), so the system gallery templates (system_document_templates) that companies copy from need those two
 * fields. This adds them to every gallery template of Quotation, Sales Order, Sales Invoice and Proforma Invoice
 * that does not have one yet.
 *
 * Placement is relative to each template's own "Terms & Conditions" block (the QR sits just above it, left
 * aligned with it), so it follows the A4 / A5 / narrow receipt variants. The size is the A4 22 mm scaled to
 * the page width, but never below 16 mm so the QR stays scannable. Field properties are copied from the
 * template's own signature image / terms text fields, so they match what the designer expects.
 *
 * Idempotent (skips a template that already has `paymentQR`). Company copies of these templates (tenant
 * document_print_templates) are not touched here.
 */

const DOC_TYPES = ["quotation", "salesOrder", "salesInvoice", "proformaInvoice"];
const A4_WIDTH = 210;
const QR_A4_SIZE_MM = 22;
const QR_MIN_SIZE_MM = 16;
const LABEL_HEIGHT_RATIO = 5 / 22;
const GAP_MM = 3;

const round = (n) => Math.round(n * 100) / 100;

const addPaymentQrFields = (template) => {
  const pages = template?.schemas;
  if (!Array.isArray(pages) || !pages.length) return null;
  const fields = pages.flat();
  if (fields.some((f) => f?.name === "paymentQR")) return null;

  const terms = fields.find((f) => f?.name === "termsAndConditions");
  const imageBase = fields.find((f) => f?.type === "image" && f?.name === "signatureImage") || fields.find((f) => f?.type === "image");
  if (!terms || !imageBase) return null;

  const pageWidth = Number(template.basePdf?.width) || A4_WIDTH;
  const size = round(Math.max(QR_MIN_SIZE_MM, (QR_A4_SIZE_MM * pageWidth) / A4_WIDTH));
  const labelHeight = round(size * LABEL_HEIGHT_RATIO);
  const x = terms.position.x;
  const y = round(Math.max(0, terms.position.y - size - labelHeight - GAP_MM));

  const qr = {
    ...JSON.parse(JSON.stringify(imageBase)),
    name: "paymentQR",
    dataSource: "paymentQR",
    content: "",
    position: { x, y },
    width: size,
    height: size,
    visibilityCondition: { mode: "hideIfEmpty" },
  };
  delete qr.id;

  const label = {
    ...JSON.parse(JSON.stringify(terms)),
    name: "paymentQRLabel",
    dataSource: "paymentQRLabel",
    content: "Scan to Pay",
    position: { x, y: round(y + size) },
    width: size,
    height: labelHeight,
    alignment: "center",
    fontSize: round(Math.max(4, (6 * pageWidth) / A4_WIDTH)),
    readOnly: true,
    visibilityCondition: { mode: "compare", field: "paymentQR", operator: "isNotEmpty" },
  };
  delete label.id;

  // Same page as the Terms block.
  const pageIndex = pages.findIndex((p) => (p || []).includes(terms));
  const next = JSON.parse(JSON.stringify(template));
  next.schemas[pageIndex < 0 ? 0 : pageIndex].push(qr, label);
  return next;
};

const removePaymentQrFields = (template) => {
  const next = JSON.parse(JSON.stringify(template));
  let changed = false;
  next.schemas = (next.schemas || []).map((page) =>
    (page || []).filter((f) => {
      const drop = f?.name === "paymentQR" || f?.name === "paymentQRLabel";
      if (drop) changed = true;
      return !drop;
    })
  );
  return changed ? next : null;
};

const rewrite = async (queryInterface, transform) => {
  const [rows] = await queryInterface.sequelize.query(
    "SELECT `id`, `template_json` FROM `system_document_templates` WHERE `isDelete` = 0 AND `doc_type` IN (:docTypes)",
    { replacements: { docTypes: DOC_TYPES } }
  );
  for (const row of rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.template_json);
    } catch {
      console.warn(`system_document_templates #${row.id}: template_json is not valid JSON, skipped`);
      continue;
    }
    const updated = transform(parsed);
    if (!updated) continue;
    await queryInterface.sequelize.query("UPDATE `system_document_templates` SET `template_json` = :json WHERE `id` = :id", {
      replacements: { json: JSON.stringify(updated), id: row.id },
    });
  }
};

export const up = async (queryInterface) => {
  await rewrite(queryInterface, addPaymentQrFields);
};

export const down = async (queryInterface) => {
  await rewrite(queryInterface, removePaymentQrFields);
};
