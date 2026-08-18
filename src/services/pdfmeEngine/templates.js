import { buildDocTemplate, HEADER_VARIANTS, shiftFieldY } from "./buildTemplate.js";
import { resolvePageDimensions, scaleTemplate } from "./paperSize.js";

// Mirrors the same 10 document types + default titles already used across
// backend/src/services/company_setup/companyService.js (companyBody defaults)
// and the existing EJS templates (dynamicTitle switch). Same string ids as
// the report-designer-poc so the pattern carries forward unchanged.
export const DOC_TYPES = [
  { id: "quotation", title: "Quotation" },
  { id: "salesOrder", title: "Sales Order" },
  { id: "salesInvoice", title: "Sales Invoice" },
  { id: "purchaseOrder", title: "Purchase Order" },
  { id: "purchaseInvoice", title: "Purchase" },
  { id: "returnSalesInvoice", title: "Return Sales Invoice" },
  { id: "returnPurchaseInvoice", title: "Return Purchase Invoice" },
  { id: "inward", title: "Goods Received Note (GRN)" },
  { id: "dispatch", title: "Dispatch" },
  { id: "proformaInvoice", title: "Proforma Invoice" },
];

export { HEADER_VARIANTS };

const titleById = Object.fromEntries(DOC_TYPES.map((d) => [d.id, d.title]));

// headerOptions: { headerVariant?: 'image'|'details'|'logoLeft'|'logoRight', footerImage?: boolean }
export function getTemplate(id, headerOptions = {}) {
  const title = titleById[id];
  if (!title) {
    throw new Error(`Unknown document type: ${id}`);
  }
  return buildDocTemplate(title, headerOptions);
}

// staticSchema fields render their own fixed template `content` — generate()
// does NOT map `inputs` onto them the way it does for the paginated `schemas`
// array. So company header text/images have to be baked into the template's
// staticSchema content per-request instead, fresh on every generate — never
// stored back into the saved draft/published JSON.
//
// Swaps in a different header/footer variant and/or item-table column set on
// an already-loaded (possibly user-customized) template, without touching
// the rest of the layout. header and columnOptions are independently gated —
// passing only one must NOT touch the other's fields (a real bug this fixes:
// columnOptions rebuilding staticSchema used to silently reset the header
// back to "details" even if "logoLeft" was selected, and vice versa).
export function applyTemplateOptions(id, loadedTemplate, { header = null, columnOptions = null, pageSize = null } = {}) {
  if (!header && !columnOptions && !pageSize) return loadedTemplate;
  let cloned = structuredClone(loadedTemplate);

  if (header) {
    const fresh = getTemplate(id, header);
    // A taller header banner needs docTitle/buyer-info/order-info/itemsTable
    // shifted down to clear it.
    const deltaY = fresh.basePdf.padding[0] - cloned.basePdf.padding[0];
    cloned.basePdf.padding = fresh.basePdf.padding;
    cloned.basePdf.staticSchema = fresh.basePdf.staticSchema;
    cloned.basePdf.headerVariant = fresh.basePdf.headerVariant;
    cloned.basePdf.footerImage = fresh.basePdf.footerImage;
    cloned.basePdf.headerHeightMM = fresh.basePdf.headerHeightMM;
    cloned.basePdf.footerHeightMM = fresh.basePdf.footerHeightMM;
    cloned.schemas = cloned.schemas.map((page) => page.map((field) => shiftFieldY(field, deltaY)));
  }

  if (columnOptions) {
    const fresh = getTemplate(id, { columnOptions });
    const freshTable = fresh.schemas[0].find((f) => f.name === "itemsTable");
    cloned.schemas = cloned.schemas.map((page) =>
      page.map((field) => {
        if (field.name !== "itemsTable") return field;
        // head/content/headWidthPercentages/columnStyles are structural —
        // they MUST come from the fresh rebuild. Manual styling isn't tied
        // to which columns exist, so keep it instead of discarding it on
        // every checkbox toggle.
        return {
          ...field,
          content: freshTable.content,
          head: freshTable.head,
          headWidthPercentages: freshTable.headWidthPercentages,
          columnStyles: freshTable.columnStyles,
          columnOptions: freshTable.columnOptions,
        };
      }),
    );
  }

  if (pageSize) {
    // Rebuilds from a FRESH, unscaled A4 baseline and scales THAT — never
    // scales `cloned`'s current dimensions, or repeated toggles compound.
    const currentItemsTable = cloned.schemas[0]?.find((f) => f.name === "itemsTable");
    const effectiveHeader = header || {
      headerVariant: cloned.basePdf.headerVariant,
      footerImage: cloned.basePdf.footerImage,
      headerHeightMM: cloned.basePdf.headerHeightMM,
      footerHeightMM: cloned.basePdf.footerHeightMM,
    };
    const effectiveColumnOptions = columnOptions || currentItemsTable?.columnOptions;

    const fresh = getTemplate(id, { ...effectiveHeader, columnOptions: effectiveColumnOptions });
    const { width, height } = resolvePageDimensions(pageSize);
    cloned = scaleTemplate(fresh, width, height);
  }

  return cloned;
}

// Field names are variant-specific (buildHeaderFields in buildTemplate.js):
// 'details' -> companyName + companyAddress (two boxes); logoLeft/logoRight ->
// companyDetailsWithLogo (one combined box); 'image' -> no text field at all.
// Image fields (headerImage/headerLogo/footerImage/signatureImage) are
// resolved here too, from the real per-request asset resolution — see the
// dataSource keys buildTemplate.js assigns them (companyHeaderImage/
// companyLogo/companyFooterImage/companySignatureImage). `company` carries
// both the text fields (name/address/mobile/email/gstin/state) and the
// image fields (headerImage/logoImage/footerImage/signImage — base64 data
// URIs, same shape orderServices.js's encodeImageToBase64 already produces).
export function withCompanyHeader(template, company) {
  const cloned = structuredClone(template);
  const contactLine =
    `Mo.: ${company.mobile}  Email: ${company.email}  GSTIN: ${company.gstin}  State: ${company.state}`;
  const addressLine = `Address: ${company.address}\n${contactLine}`;
  const combinedBlock = `${company.name}\n${addressLine}`;

  cloned.basePdf.staticSchema = cloned.basePdf.staticSchema.map((field) => {
    // dataSource, not name — a renamed duplicate of e.g. companyName should
    // still receive the real company name. Falls back to `field.name` for
    // templates saved before dataSource existed.
    const key = field.dataSource || field.name;
    if (key === "companyName") return { ...field, content: company.name };
    if (key === "companyAddress") return { ...field, content: addressLine };
    if (key === "companyDetailsWithLogo") return { ...field, content: combinedBlock };
    if (key === "companyHeaderImage" && company.headerImage) return { ...field, content: company.headerImage };
    if (key === "companyLogo" && company.logoImage) return { ...field, content: company.logoImage };
    if (key === "companyFooterImage" && company.footerImage) return { ...field, content: company.footerImage };
    if (key === "companySignatureImage" && company.signImage) return { ...field, content: company.signImage };
    return field;
  });

  // docTitle/originalDuplicate are readOnly fields with build-time-static
  // content/backgroundColor (buildTemplate.js) — the old EJS pipeline reads
  // <type>_title/<type>_view_color per company (orderServices.js's
  // viewTitle/dynamicColor), so a company that renamed "Sales Order" to
  // something else, or picked a different accent color, would otherwise see
  // that customization silently reset to the ported default on every pdfme
  // generate. Only overridden when the caller actually provides them —
  // Designer "Generate Preview" doesn't pass these, so preview still shows
  // whatever the template itself was designed with.
  if (company.docTitle || company.titleColor) {
    cloned.schemas = cloned.schemas.map((page) =>
      page.map((field) => {
        if (field.name === "docTitle") {
          return {
            ...field,
            ...(company.docTitle ? { content: company.docTitle } : {}),
            ...(company.titleColor ? { backgroundColor: company.titleColor } : {}),
          };
        }
        if (field.name === "originalDuplicate" && company.titleColor) {
          return { ...field, backgroundColor: company.titleColor };
        }
        return field;
      }),
    );
  }

  return cloned;
}
