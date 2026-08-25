/**
 * Migration Name: refresh-account-statement-transaction-gallery
 * Database Type: MASTER
 *
 * Refreshes the 2 "Default Account Statement" / "Default Account
 * Transaction" rows seeded by 20260821041424-seed-system-document-templates.js.
 * Those builders used to compute box heights from line counts on hand at
 * SEED time (never real print-time content), which any company copy would
 * then freeze — a later real statement with more lines than the sample
 * used at seed time overflowed into the table below. buildAccountStatement/
 * TransactionTemplate now use fixed field positions instead (see those
 * files), so this replaces the two rows with their fixed-layout output.
 */

import { buildAccountStatementTemplate } from "../../../src/services/pdfmeEngine/accountStatementTemplate.js";
import { buildAccountTransactionTemplate } from "../../../src/services/pdfmeEngine/accountTransactionTemplate.js";

const ROWS = [
  { doc_type: "accountStatement", template_name: "Default Account Statement", build: () => buildAccountStatementTemplate({ hasRows: true }) },
  { doc_type: "accountTransaction", template_name: "Default Account Transaction", build: () => buildAccountTransactionTemplate() },
];

export const up = async (queryInterface) => {
  for (const r of ROWS) {
    await queryInterface.sequelize.query(
      "UPDATE `system_document_templates` SET `template_json` = ? WHERE `doc_type` = ? AND `template_name` = ?",
      { replacements: [JSON.stringify(r.build()), r.doc_type, r.template_name] }
    );
  }
};

export const down = async () => {
  // No stored "before" snapshot to restore — this only updates JSON content
  // in place, doesn't add/remove rows. Re-run the previous migration's
  // build logic manually if a rollback is ever needed.
};
