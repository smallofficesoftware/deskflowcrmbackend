/**
 * Migration Name: seed-contact-print-document-templates
 * Database Type: MASTER
 *
 * Adds the Document Designer gallery for the 2 new contact-print doc types
 * (contactAddress, contactEnvelope), replacing the previously hardcoded
 * ContactAddressPrintView1.tsx / ContactAddressEnvelopePrintView.tsx print
 * pages with the same pdfme Document Designer path shippingLabel already
 * uses. One row each (non-cart doc types don't get the 5 header/footer
 * variant rows the cart-shaped doc types get).
 */

import { buildContactAddressTemplate } from "../../../src/services/pdfmeEngine/contactAddressTemplate.js";
import { buildContactEnvelopeTemplate } from "../../../src/services/pdfmeEngine/contactEnvelopeTemplate.js";

const NEW_DOCS = [
  { doc_type: "contactAddress", template_name: "Default Contact Address Label", build: buildContactAddressTemplate },
  { doc_type: "contactEnvelope", template_name: "Default Contact Envelope", build: buildContactEnvelopeTemplate },
];

const buildRows = () =>
  NEW_DOCS.map((d) => ({
    doc_type: d.doc_type,
    template_name: d.template_name,
    description: `${d.template_name} template`,
    template_json: JSON.stringify(d.build()),
    display_order: 1,
    isDelete: 0,
    isActive: 1,
  }));

export const up = async (queryInterface) => {
  const [existing] = await queryInterface.sequelize.query(
    "SELECT COUNT(*) as cnt FROM `system_document_templates` WHERE `doc_type` IN ('contactAddress', 'contactEnvelope')"
  );
  if (Number(existing[0].cnt) > 0) return;

  await queryInterface.bulkInsert("system_document_templates", buildRows());
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    "DELETE FROM `system_document_templates` WHERE `doc_type` IN ('contactAddress', 'contactEnvelope')"
  );
};
