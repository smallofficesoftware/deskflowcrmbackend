/**
 * Migration Name: seed-job-card-document-templates
 * Database Type: MASTER
 * Created: 10/10/2026 10:53:52 AM
 *
 * Adds the 4 Job Card doc types (ticket #2212) to the Document Designer
 * gallery (`system_document_templates`) as brand-new rows - same "generate
 * template_json live from the current builder code" approach as the
 * original 20260821041424-seed-system-document-templates.js, just inserting
 * instead of that file's one-time full seed.
 */

import { buildJobCardMasterTemplate, buildJobCardTemplate, buildProductionEntryReceiptTemplate, buildRequiredMaterialTemplate } from "../../../src/services/pdfmeEngine/jobCardTemplate.js";

const ROWS = [
  { doc_type: "jobCard", template_name: "Default Job Card", description: "Default Job Card template", build: () => buildJobCardTemplate() },
  { doc_type: "jobCardMaster", template_name: "Default Job Card Master Report", description: "Default Job Card Master Report template", build: () => buildJobCardMasterTemplate() },
  { doc_type: "requiredMaterial", template_name: "Default Required Material", description: "Default Required Material template", build: () => buildRequiredMaterialTemplate() },
  { doc_type: "productionEntryReceipt", template_name: "Default Production Entry Receipt", description: "Default Production Entry Receipt template", build: () => buildProductionEntryReceiptTemplate() },
];

export const up = async (queryInterface) => {
  const [existing] = await queryInterface.sequelize.query(
    "SELECT COUNT(*) as cnt FROM `system_document_templates` WHERE `doc_type` IN (?)",
    { replacements: [ROWS.map((r) => r.doc_type)] }
  );
  if (Number(existing[0].cnt) > 0) return;

  const rows = ROWS.map((r) => ({
    doc_type: r.doc_type,
    template_name: r.template_name,
    description: r.description,
    template_json: JSON.stringify(r.build()),
    display_order: 1,
    isDelete: 0,
    isActive: 1,
  }));

  for (const row of rows) {
    await queryInterface.bulkInsert("system_document_templates", [row]);
  }
};

export const down = async (queryInterface) => {
  await queryInterface.bulkDelete("system_document_templates", {
    doc_type: ROWS.map((r) => r.doc_type),
  });
};
