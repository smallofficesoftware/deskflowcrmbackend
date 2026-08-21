/**
 * Migration Name: reseed-cart-templates-v1-v5
 * Database Type: MASTER
 *
 * Replaces the 10-cart-doc-type x 5 rows seeded by
 * 20260821041424-seed-system-document-templates.js. Those 5 "variants" were
 * just header-banner swaps at the same page size — the legacy
 * orderPdfV1-V5.ejs's real distinguishing axis was page size (A4 vs A5 vs
 * an 88mm narrow/receipt layout), so this deletes those 50 rows and
 * reinserts V1-V5 built that way instead. Does NOT touch the 4 non-cart
 * system doc rows (accountStatement/accountTransaction/taskDueList/
 * shippingLabel) from the same earlier migration — those are unrelated.
 */

import { DOC_TYPES, getTemplate } from "../../../src/services/pdfmeEngine/templates.js";
import { resolvePageDimensions, scaleTemplate } from "../../../src/services/pdfmeEngine/paperSize.js";

// V1/V2 = A4, V3/V4 = A5, V5 = 88mm narrow (matches orderPdfV1-V5.ejs's
// real @page size split). Header variant is a secondary axis so V1 vs V2
// (both A4) and V3 vs V4 (both A5) are visually distinct from each other
// too — not a legacy behavior, just fills out 5 meaningfully different
// looks per doc type.
const VARIANTS = [
  { label: "V1 (A4)", header: { headerVariant: "details" }, pageSize: { pageSize: "A4" } },
  { label: "V2 (A4, Compact)", header: { headerVariant: "image" }, pageSize: { pageSize: "A4" } },
  { label: "V3 (A5)", header: { headerVariant: "details" }, pageSize: { pageSize: "A5" } },
  { label: "V4 (A5, Compact)", header: { headerVariant: "image" }, pageSize: { pageSize: "A5" } },
  { label: "V5 (Narrow Receipt)", header: { headerVariant: "image" }, pageSize: { pageSize: "Custom", customWidth: 88, customHeight: 210 } },
];

const CART_DOC_TYPE_IDS = DOC_TYPES.map((d) => d.id);

const buildRows = () => {
  const rows = [];
  DOC_TYPES.forEach((d) => {
    VARIANTS.forEach((v, idx) => {
      let template = getTemplate(d.id, v.header);
      const { width, height } = resolvePageDimensions(v.pageSize);
      template = scaleTemplate(template, width, height);
      rows.push({
        doc_type: d.id,
        template_name: `${d.title} - ${v.label}`,
        description: `Default ${d.title} template (${v.label})`,
        template_json: JSON.stringify(template),
        display_order: idx + 1,
        isDelete: 0,
        isActive: 1,
      });
    });
  });
  return rows;
};

// Each row's template_json is ~35-40KB — bulk-inserting all 50 rows in one
// statement exceeds MySQL's max_allowed_packet, so insert a few rows at a
// time instead.
const CHUNK_SIZE = 5;

export const up = async (queryInterface) => {
  await queryInterface.bulkDelete("system_document_templates", {
    doc_type: CART_DOC_TYPE_IDS,
  });
  const rows = buildRows();
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await queryInterface.bulkInsert("system_document_templates", rows.slice(i, i + CHUNK_SIZE));
  }
};

export const down = async (queryInterface) => {
  await queryInterface.bulkDelete("system_document_templates", {
    doc_type: CART_DOC_TYPE_IDS,
  });
};
