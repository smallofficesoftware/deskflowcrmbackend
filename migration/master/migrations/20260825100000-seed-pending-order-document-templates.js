/**
 * Migration Name: seed-pending-order-document-templates
 * Database Type: MASTER
 *
 * Adds the Document Designer gallery for the 2 new "pending" doc types
 * (pendingSalesOrder, pendingPurchaseOrder — templates.js's DOC_TYPES).
 * One row each, not the 5 header/footer variants the other 10 cart doc
 * types get — header is edited per-template in the Designer itself, not
 * picked from pre-seeded variants, for these 2.
 */

import { getTemplate } from "../../../src/services/pdfmeEngine/templates.js";

const NEW_DOC_TYPES = [
  { id: "pendingSalesOrder", title: "Pending Sales Order" },
  { id: "pendingPurchaseOrder", title: "Pending Purchase Order" },
];

const buildRows = () =>
  NEW_DOC_TYPES.map((d) => ({
    doc_type: d.id,
    template_name: `Default ${d.title}`,
    description: `Default ${d.title} template`,
    template_json: JSON.stringify(getTemplate(d.id)),
    display_order: 1,
    isDelete: 0,
    isActive: 1,
  }));

export const up = async (queryInterface) => {
  const [existing] = await queryInterface.sequelize.query(
    "SELECT COUNT(*) as cnt FROM `system_document_templates` WHERE `doc_type` IN ('pendingSalesOrder', 'pendingPurchaseOrder')"
  );
  if (Number(existing[0].cnt) > 0) return;

  await queryInterface.bulkInsert("system_document_templates", buildRows());
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    "DELETE FROM `system_document_templates` WHERE `doc_type` IN ('pendingSalesOrder', 'pendingPurchaseOrder')"
  );
};
