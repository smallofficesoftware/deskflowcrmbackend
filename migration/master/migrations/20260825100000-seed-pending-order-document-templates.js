/**
 * Migration Name: seed-pending-order-document-templates
 * Database Type: MASTER
 *
 * Adds the Document Designer gallery for the 2 new "pending" doc types
 * (pendingSalesOrder, pendingPurchaseOrder — templates.js's DOC_TYPES),
 * 5 header/footer variants each = 10 rows. Same pattern as the original
 * seed-system-document-templates migration, scoped to just these 2 types
 * so it can run on top of an already-seeded table.
 */

import { getTemplate } from "../../../src/services/pdfmeEngine/templates.js";

const NEW_DOC_TYPES = [
  { id: "pendingSalesOrder", title: "Pending Sales Order" },
  { id: "pendingPurchaseOrder", title: "Pending Purchase Order" },
];

const VARIANTS = [
  { label: "Image Header", opts: { headerVariant: "image" } },
  { label: "Details Header", opts: { headerVariant: "details" } },
  { label: "Logo Left", opts: { headerVariant: "logoLeft" } },
  { label: "Logo Right", opts: { headerVariant: "logoRight" } },
  { label: "Details + Footer", opts: { headerVariant: "details", footerImage: true } },
];

const buildRows = () => {
  const rows = [];
  NEW_DOC_TYPES.forEach((d) => {
    VARIANTS.forEach((v, idx) => {
      rows.push({
        doc_type: d.id,
        template_name: `${d.title} - ${v.label}`,
        description: `Default ${d.title} template (${v.label})`,
        template_json: JSON.stringify(getTemplate(d.id, v.opts)),
        display_order: idx + 1,
        isDelete: 0,
        isActive: 1,
      });
    });
  });
  return rows;
};

// Same packet-size reasoning as the original seed migration.
const CHUNK_SIZE = 5;

export const up = async (queryInterface) => {
  const [existing] = await queryInterface.sequelize.query(
    "SELECT COUNT(*) as cnt FROM `system_document_templates` WHERE `doc_type` IN ('pendingSalesOrder', 'pendingPurchaseOrder')"
  );
  if (Number(existing[0].cnt) > 0) return;

  const rows = buildRows();
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await queryInterface.bulkInsert("system_document_templates", rows.slice(i, i + CHUNK_SIZE));
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    "DELETE FROM `system_document_templates` WHERE `doc_type` IN ('pendingSalesOrder', 'pendingPurchaseOrder')"
  );
};
