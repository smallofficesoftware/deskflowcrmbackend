/**
 * Migration Name: seed-system-document-templates
 * Database Type: MASTER
 *
 * Seeds the Document Designer gallery (`system_document_templates`) with:
 *  - 10 cart doc types (templates.js's DOC_TYPES) x 5 header/footer variants = 50 rows
 *  - 4 non-cart system documents (account statement/transaction, task due
 *    list, shipping label) x 1 row each = 4 rows
 * Template JSON is generated live from the same pdfmeEngine builders the
 * Designer itself uses, not baked into this file, so a fresh install always
 * seeds whatever the current builder code produces.
 */

import { DOC_TYPES, getTemplate } from "../../../src/services/pdfmeEngine/templates.js";
import { buildAccountStatementTemplate } from "../../../src/services/pdfmeEngine/accountStatementTemplate.js";
import { buildAccountTransactionTemplate } from "../../../src/services/pdfmeEngine/accountTransactionTemplate.js";
import { buildTaskDueListTemplate } from "../../../src/services/pdfmeEngine/taskDueListTemplate.js";
import { buildShippingLabelTemplate } from "../../../src/services/pdfmeEngine/shippingLabelTemplate.js";

const VARIANTS = [
  { label: "Image Header", opts: { headerVariant: "image" } },
  { label: "Details Header", opts: { headerVariant: "details" } },
  { label: "Logo Left", opts: { headerVariant: "logoLeft" } },
  { label: "Logo Right", opts: { headerVariant: "logoRight" } },
  { label: "Details + Footer", opts: { headerVariant: "details", footerImage: true } },
];

const SYSTEM_DOCS = [
  {
    doc_type: "accountStatement",
    template_name: "Default Account Statement",
    description: "Default Account Statement template",
    build: () => buildAccountStatementTemplate({ leftLineCount: 6, rightLineCount: 6, hasRows: true }),
  },
  {
    doc_type: "accountTransaction",
    template_name: "Default Account Transaction",
    description: "Default Account Transaction template",
    build: () => buildAccountTransactionTemplate({ headerLineCount: 6, contactRowCount: 3, remarkLineCount: 1 }),
  },
  {
    doc_type: "taskDueList",
    template_name: "Default Task Due List",
    description: "Default Task Due List template",
    build: () => buildTaskDueListTemplate(),
  },
  {
    doc_type: "shippingLabel",
    template_name: "Default Shipping Label",
    description: "Default Shipping Label template",
    build: () => buildShippingLabelTemplate(),
  },
];

const buildRows = () => {
  const rows = [];

  DOC_TYPES.forEach((d) => {
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

  SYSTEM_DOCS.forEach((s) => {
    rows.push({
      doc_type: s.doc_type,
      template_name: s.template_name,
      description: s.description,
      template_json: JSON.stringify(s.build()),
      display_order: 1,
      isDelete: 0,
      isActive: 1,
    });
  });

  return rows;
};

// Each row's template_json is ~35-40KB — bulk-inserting all 54 rows in one
// statement exceeds MySQL's max_allowed_packet, so insert a few rows at a
// time instead.
const CHUNK_SIZE = 5;

export const up = async (queryInterface) => {
  const [existing] = await queryInterface.sequelize.query(
    "SELECT COUNT(*) as cnt FROM `system_document_templates`"
  );
  if (Number(existing[0].cnt) > 0) return;

  const rows = buildRows();
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await queryInterface.bulkInsert("system_document_templates", rows.slice(i, i + CHUNK_SIZE));
  }
};

export const down = async (queryInterface) => {
  const docTypes = [
    ...DOC_TYPES.map((d) => d.id),
    ...SYSTEM_DOCS.map((s) => s.doc_type),
  ];
  await queryInterface.bulkDelete("system_document_templates", {
    doc_type: docTypes,
  });
};
