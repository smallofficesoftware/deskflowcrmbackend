/**
 * Migration Name: add-payment-qr-to-document-print-templates
 * Database Type: TENANT
 * Created: 03/11/2026
 *
 * The UPI "Scan to Pay" QR used to be added by code at a fixed spot (x 10, y 220) when a Quotation / Sales Order /
 * Sales Invoice / Proforma Invoice was printed. It now prints only where a template has a `paymentQR` image field
 * (plus a `paymentQRLabel` "Scan to Pay" text field). Templates a company already saved (copied from the gallery
 * earlier, or built by hand) do not have those fields, so without this migration their printed documents would
 * lose the QR.
 *
 * For every main template of those four document types that has an items table and no `paymentQR` field yet,
 * the two fields are added to BOTH the draft and the published JSON:
 *   - placed just above the template's own "Terms & Conditions" block, left aligned with it (so it follows A4 /
 *     A5 / receipt layouts and any layout the company changed); a template without a Terms block gets the old
 *     spot, scaled to the page;
 *   - size: A4 22 mm scaled to the page width, never below 16 mm so the QR stays scannable;
 *   - properties are copied from the template's own signature image / terms text fields, so they match what the
 *     designer expects.
 * The fields hide themselves when the company has the payment QR off or no UPI details, so a company that never
 * printed a QR is not affected.
 *
 * Idempotent (a template that already has `paymentQR` is skipped). The system gallery is handled by master
 * migration 20261103140000-add-payment-qr-to-system-document-templates.js.
 */

const TABLE = "document_print_templates";
const DOC_TYPES = ["quotation", "salesOrder", "salesInvoice", "proformaInvoice"];
const A4_WIDTH = 210;
const A4_HEIGHT = 297;
const QR_A4_SIZE_MM = 22;
const QR_MIN_SIZE_MM = 16;
const LABEL_HEIGHT_RATIO = 5 / 22;
const GAP_MM = 3;
const OLD_FIXED_X_MM = 10;
const OLD_FIXED_Y_MM = 220;

const round = (n) => Math.round(n * 100) / 100;
const clone = (o) => JSON.parse(JSON.stringify(o));

const addPaymentQrFields = (template) => {
  const pages = template?.schemas;
  if (!Array.isArray(pages) || !pages.length) return null;
  const fields = pages.flat().filter(Boolean);
  if (fields.some((f) => f.name === "paymentQR" || f.dataSource === "paymentQR")) return null;
  // Only real item-table layouts (not a terms-only page or a product page saved under the same doc type).
  if (!fields.some((f) => f.name === "itemsTable")) return null;

  const pageWidth = Number(template.basePdf?.width) || A4_WIDTH;
  const pageHeight = Number(template.basePdf?.height) || A4_HEIGHT;
  const size = round(Math.max(QR_MIN_SIZE_MM, (QR_A4_SIZE_MM * pageWidth) / A4_WIDTH));
  const labelHeight = round(size * LABEL_HEIGHT_RATIO);

  const terms = fields.find((f) => f.name === "termsAndConditions" && f.position);
  const imageBase = fields.find((f) => f.type === "image" && f.name === "signatureImage") || fields.find((f) => f.type === "image");
  const textBase = terms || fields.find((f) => f.type === "text");

  let x;
  let y;
  let pageIndex;
  if (terms) {
    x = terms.position.x;
    y = round(Math.max(0, terms.position.y - size - labelHeight - GAP_MM));
    pageIndex = pages.findIndex((p) => (p || []).includes(terms));
  } else {
    x = round((OLD_FIXED_X_MM * pageWidth) / A4_WIDTH);
    y = round(Math.min((OLD_FIXED_Y_MM * pageHeight) / A4_HEIGHT, pageHeight - size - labelHeight - 10));
    pageIndex = pages.findIndex((p) => (p || []).some((f) => f?.name === "itemsTable"));
  }
  if (pageIndex < 0) pageIndex = 0;

  const qr = {
    ...(imageBase ? clone(imageBase) : { type: "image", rotate: 0, opacity: 1 }),
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
    ...(textBase
      ? clone(textBase)
      : { type: "text", rotate: 0, opacity: 1, verticalAlignment: "top", lineHeight: 1.4, characterSpacing: 0, fontColor: "#000000", backgroundColor: "" }),
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

  const next = clone(template);
  next.schemas[pageIndex].push(qr, label);
  return next;
};

const removePaymentQrFields = (template) => {
  const next = clone(template);
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

const patchColumn = (row, column, transform) => {
  if (!row[column]) return null;
  let parsed;
  try {
    parsed = JSON.parse(row[column]);
  } catch {
    console.warn(`${TABLE} #${row.id}: ${column} is not valid JSON, skipped`);
    return null;
  }
  const updated = transform(parsed);
  return updated ? JSON.stringify(updated) : null;
};

const rewrite = async (queryInterface, transform) => {
  const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE :table", { replacements: { table: TABLE } });
  if (!tables.length) return;

  const [rows] = await queryInterface.sequelize.query(
    `SELECT \`id\`, \`draft_template_json\`, \`published_template_json\`
       FROM \`${TABLE}\`
      WHERE \`isDelete\` = 0 AND \`template_purpose\` = 'main' AND \`doc_type\` IN (:docTypes)`,
    { replacements: { docTypes: DOC_TYPES } }
  );

  for (const row of rows) {
    const draft = patchColumn(row, "draft_template_json", transform);
    const published = patchColumn(row, "published_template_json", transform);
    if (draft === null && published === null) continue;
    const sets = [];
    const replacements = { id: row.id };
    if (draft !== null) {
      sets.push("`draft_template_json` = :draft");
      replacements.draft = draft;
    }
    if (published !== null) {
      sets.push("`published_template_json` = :published");
      replacements.published = published;
    }
    await queryInterface.sequelize.query(`UPDATE \`${TABLE}\` SET ${sets.join(", ")} WHERE \`id\` = :id`, { replacements });
  }
};

export const up = async (queryInterface) => {
  await rewrite(queryInterface, addPaymentQrFields);
};

export const down = async (queryInterface) => {
  await rewrite(queryInterface, removePaymentQrFields);
};
