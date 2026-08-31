/**
 * Migration Name: seed-employee-account-document-templates
 * Database Type: MASTER
 *
 * Adds the Document Designer gallery for the 2 new Team/Employee account
 * doc types (employeeAccountStatement, employeeAccountTransaction) — Team's
 * OWN customization slot, deliberately separate from the Contact variant's
 * accountStatement/accountTransaction gallery rows, so a company can brand
 * an employee statement/receipt differently from a customer one. One row
 * each (non-cart doc types don't get the 5 header/footer variant rows the
 * cart-shaped doc types get).
 */

import { buildEmployeeAccountStatementTemplate } from "../../../src/services/pdfmeEngine/employeeAccountStatementTemplate.js";
import { buildEmployeeAccountTransactionTemplate } from "../../../src/services/pdfmeEngine/employeeAccountTransactionTemplate.js";

const NEW_DOCS = [
  { doc_type: "employeeAccountStatement", template_name: "Default Team Account Statement", build: buildEmployeeAccountStatementTemplate },
  { doc_type: "employeeAccountTransaction", template_name: "Default Team Account Transaction", build: buildEmployeeAccountTransactionTemplate },
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
    "SELECT COUNT(*) as cnt FROM `system_document_templates` WHERE `doc_type` IN ('employeeAccountStatement', 'employeeAccountTransaction')"
  );
  if (Number(existing[0].cnt) > 0) return;

  await queryInterface.bulkInsert("system_document_templates", buildRows());
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    "DELETE FROM `system_document_templates` WHERE `doc_type` IN ('employeeAccountStatement', 'employeeAccountTransaction')"
  );
};
