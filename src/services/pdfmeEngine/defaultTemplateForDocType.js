// Single dispatch from a doc_type string to its code-default pdfme template
// — the same builders the generate-time wrappers fall back to when a tenant
// has no saved template (buildAccountStatementTemplate & co.) and, for the
// cart-shaped types, templates.js's own getTemplate().
//
// Used by the "Add Field" picker in the Document Designer: the generic
// palette can only drop a blank text/table/image field, so a structured
// data-bound field (statementTable, itemsTable, taskTable, the company/
// contact header rows, ...) that was deleted can't be put back with the
// right name/columns/styles. The editor lists this template's fields and
// re-inserts the picked one verbatim.
import { buildAccountStatementTemplate } from "./accountStatementTemplate.js";
import { buildAccountTransactionTemplate } from "./accountTransactionTemplate.js";
import { buildContactAddressTemplate } from "./contactAddressTemplate.js";
import { buildContactEnvelopeTemplate } from "./contactEnvelopeTemplate.js";
import { buildEmployeeAccountStatementTemplate } from "./employeeAccountStatementTemplate.js";
import { buildEmployeeAccountTransactionTemplate } from "./employeeAccountTransactionTemplate.js";
import { buildShippingLabelTemplate } from "./shippingLabelTemplate.js";
import { buildTaskDueListTemplate } from "./taskDueListTemplate.js";
import { getTemplate } from "./templates.js";

const NON_CART_BUILDERS = {
  accountStatement: buildAccountStatementTemplate,
  accountTransaction: buildAccountTransactionTemplate,
  employeeAccountStatement: buildEmployeeAccountStatementTemplate,
  employeeAccountTransaction: buildEmployeeAccountTransactionTemplate,
  taskDueList: buildTaskDueListTemplate,
  shippingLabel: buildShippingLabelTemplate,
  contactAddress: buildContactAddressTemplate,
  contactEnvelope: buildContactEnvelopeTemplate,
};

export function defaultTemplateForDocType(doc_type) {
  const nonCartBuilder = NON_CART_BUILDERS[doc_type];
  if (nonCartBuilder) return nonCartBuilder();
  // Cart-shaped types (quotation/salesInvoice/pendingSalesOrder/...) —
  // getTemplate throws "Unknown document type" on anything it doesn't know,
  // which is the right behavior for an unrecognized doc_type here too.
  return getTemplate(doc_type);
}
