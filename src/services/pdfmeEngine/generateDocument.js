// Orchestrates one real Quotation generate() call — this is the ONE function
// orderServices.js's pdfOrder calls when a company is pdfme-enabled, so that
// function's own edit stays a small branch + one call, not a rewrite of the
// existing EJS/pdf-creator-node path around it.
import axios from "axios";
import { generate } from "@pdfme/generator";
import { PDFDocument } from "@pdfme/pdf-lib";
import * as plugins from "@pdfme/schemas";
import { documentPrintTemplateModel } from "../../models/company_setup/documentPrintTemplateModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { getTemplate, withCompanyHeader } from "./templates.js";
import { loadFonts } from "./fonts.js";
import { overlayItemImages, sniffImageMime } from "./imageOverlay.js";
import {
  applyConditionalVisibility,
  applyTokenSubstitution,
  buildCashDiscount,
  buildComputedFields,
  buildExtraPages,
  buildHsnSummary,
  buildHsnTaxRows,
  buildInputsForCart,
  fillMissingInputsFromContent,
  injectPaymentQRField,
  injectWatermarkField,
  resolveDataSources,
} from "./orderInputMapper.js";

// Loaded once at process start (font files don't change at runtime), reused
// across every generate call — same reasoning as the POC.
const fontMap = loadFonts();

const pluginMap = {
  text: plugins.text,
  table: plugins.table,
  image: plugins.image,
  line: plugins.line,
  rectangle: plugins.rectangle,
  date: plugins.date,
  signature: plugins.signature,
};

// Builds one tiny single-field template sized to match the main document's
// basePdf, for a pageText/pageURL extra page — same technique the POC's
// mergeExtraPages uses.
function buildExtraPageTemplate(entry, basePdf) {
  const field =
    entry.kind === "text"
      ? {
          name: "extraPageText",
          type: "text",
          content: String(entry.value),
          position: { x: 10, y: 10 },
          width: basePdf.width - 20,
          height: basePdf.height - 20,
          fontSize: 10,
          lineHeight: 1.4,
        }
      : {
          name: "extraPageImage",
          type: "image",
          content: entry.value,
          position: { x: 0, y: 0 },
          width: basePdf.width,
          height: basePdf.height,
        };

  return {
    basePdf: { width: basePdf.width, height: basePdf.height, padding: [0, 0, 0, 0] },
    schemas: [[field]],
  };
}

// pageURL (data_type 12) stores a plain http(s) URL — the old EJS pipeline
// just emits <img src="url"> and lets the browser-based renderer fetch it.
// pdfme has no browser: @pdfme/schemas' image plugin hands content straight
// to pdf-lib's embedPng/embedJpg, which only accept actual image bytes (a
// `data:image/...;base64,...` URI), not a URL string. Fetch + convert here,
// once, before the field ever reaches pdfme.
async function toImageDataUri(value) {
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  const response = await axios.get(value, { responseType: "arraybuffer", timeout: 15000 });
  const bytes = Buffer.from(response.data);
  // Trusting the response's content-type header (or worse, defaulting to
  // "image/jpeg" for anything not explicitly "png") let a broken/redirected
  // URL — a 404 HTML page, a WEBP/GIF/SVG, a CDN mislabeling its
  // content-type — get declared as JPEG with non-JPEG bytes. pdf-lib's
  // embedJpg() only checks the declared mime, not the real bytes, so it
  // wouldn't fail until deep inside generate() (line ~140+), outside this
  // function's own try/catch in the caller — surfacing as a bare "SOI not
  // found in JPEG" that took down the whole /order-pdf request instead of
  // just skipping this one page. Sniff the real magic bytes instead — same
  // fix already applied to on-disk file reads (imageOverlay.js).
  const mime = sniffImageMime(bytes);
  if (!mime) return "";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

// designerPage entry.value is a document_print_templates id — fetch that
// company's own saved template and render it as-is: no rawInputs binding
// (resolveDataSources/fillMissingInputsFromContent with an empty object
// just pulls each field's own baked-in `content`), since this is a static
// attached page (terms sheet, flyer), not bound to the current cart's data.
async function buildDesignerPageBytes(entry, company, tenantDB) {
  const Template = documentPrintTemplateModel(tenantDB);
  const row = await Template.findOne({
    where: { id: entry.value, company_masters_id: company.id, isDelete: 0 },
  });
  if (!row?.published_template_json) return null;

  const template = JSON.parse(row.published_template_json);
  let resolvedInputs = resolveDataSources(template, {});
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
  return generate({ template, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
}

async function mergeExtraPages(mainBuffer, basePdf, extraPages, company, tenantDB) {
  const { before, after } = extraPages;
  if (before.length === 0 && after.length === 0) return mainBuffer;

  const buildBytes = async (entry) => {
    if (entry.kind === "designerPage") {
      try {
        return await buildDesignerPageBytes(entry, company, tenantDB);
      } catch {
        // Deleted/inaccessible template shouldn't take down the whole
        // generate — skip just this one extra page (same as a broken
        // pageURL image below).
        return null;
      }
    }
    if (entry.kind === "image") {
      let dataUri;
      try {
        dataUri = await toImageDataUri(entry.value);
      } catch {
        // Broken/unreachable pageURL shouldn't take down the whole
        // generate — skip just this one extra page.
        return null;
      }
      if (!dataUri) return null;
      entry = { ...entry, value: dataUri };
    }
    const pageTemplate = buildExtraPageTemplate(entry, basePdf);
    // @pdfme/schemas' pdf() renderer reads the field's value off the
    // `inputs` array (`arg.value`), not `schema.content` — `schema.content`
    // is only the Designer canvas's placeholder/default. An empty inputs
    // object here means the field silently renders nothing at all
    // (`if (!value) return;`) — a blank page, no error, easy to miss.
    const fieldName = entry.kind === "text" ? "extraPageText" : "extraPageImage";
    return generate({ template: pageTemplate, inputs: [{ [fieldName]: entry.value }], plugins: pluginMap, options: { font: fontMap } });
  };

  const finalDoc = await PDFDocument.create();
  const orderedBytes = [
    ...(await Promise.all(before.map(buildBytes))),
    mainBuffer,
    ...(await Promise.all(after.map(buildBytes))),
  ].filter(Boolean);
  for (const bytes of orderedBytes) {
    const doc = await PDFDocument.load(bytes);
    const copiedPages = await finalDoc.copyPages(doc, doc.getPageIndices());
    copiedPages.forEach((p) => finalDoc.addPage(p));
  }
  return Buffer.from(await finalDoc.save());
}

// company: { id, name, address, gstin, mobile, email, headerImage, logoImage,
//   footerImage, signImage, watermark_in_print } — real per-request asset
// resolution, same variables orderServices.js's pdfOrder already computes
// (encodeImageToBase64 etc.) before its ejs.render() call.
// buyer/order/computed: see orderInputMapper.js's buildInputsForCart shape.
// extraPageRows: the cart's own formType 11/12 custom-field rows
// ({ data_type, reference_column_name, display_order }), already fetched by
// pdfOrder for the EJS path — reused here, not re-queried.
// templateOverride: pass a raw pdfme Template object directly, bypassing the
// DB lookup entirely — this is what the Designer's "Generate Preview" uses
// (§6), since /order-pdf's normal path only ever reads a template's
// PUBLISHED state (§5), and preview specifically needs to render the
// in-progress DRAFT instead. Real generation (§5) never passes this.
export async function generateQuotationPdf({
  documentTemplateId,
  templateOverride,
  company,
  buyer,
  order,
  items,
  cart,
  numberTowords,
  columnOptions,
  itemImages,
  // "Product Page Designer" — 1:1 with items/itemImages, in cart item
  // order. Only spliced in when the resolved main template's
  // include_product_pages flag is on (see includeProductPages above).
  itemProductIds,
  customFieldRows,
  cartValues,
  tenantDB,
  // Totals-box + HSN/GST-table inputs (buildTemplate.js's buildHsnAndTotalsFields,
  // orderInputMapper.js's buildHsnTaxRows/buildCashDiscount) — same
  // company/customer state comparison and fixed HSN/GST-rate constants for
  // packing/transport charges orderServices.js already resolves for the EJS
  // path (TRANSPORT_CHARGE_HSN_CODE etc., appConstants.js), passed straight
  // through rather than re-resolved here.
  isSameState = false,
  packingChargeLabel,
  transportChargeLabel,
  tcsLabel,
  bankDetails,
  remarks,
  note,
  packingHSN,
  packingGSTRate,
  transportHSN,
  transportGSTRate,
  // Historical name (this started Quotation-only) — now doc-type generic.
  // Every cart-shaped doc type (Sales Order, Sales Invoice, etc.) shares
  // this exact same engine/dictionary (templates.js's DOC_TYPES,
  // dataDictionary.js's CART_DOC_DICTIONARY), only the doc_type string and
  // which template row gets looked up differ.
  doc_type = "quotation",
}) {
  let template;
  // Captured separately from `template` (which gets reassigned to the
  // parsed JSON below) — only a real DB row has this column; a
  // templateOverride (Designer's own "Generate Preview") has no row at all,
  // so product-wise pages are skipped there, same as customFieldRows-driven
  // extra pages already are for that path.
  let includeProductPages = false;

  if (templateOverride) {
    template = templateOverride;
  } else {
    const Template = documentPrintTemplateModel(tenantDB);
    let templateRow = null;
    if (documentTemplateId) {
      // template_purpose='main' guard: an extra_page row (Document Designer
      // Page custom field source) has no itemsTable/totals/buyer fields at
      // all — rendering one as the actual quotation crashes downstream
      // (buildInputsForCart/overlayItemImages expect those to exist) instead
      // of failing cleanly. An explicit id pointing at one is treated the
      // same as "not found", falling through to the real default below.
      templateRow = await Template.findOne({ where: { id: documentTemplateId, company_masters_id: company.id, template_purpose: "main", isDelete: 0 } });
    }
    if (!templateRow) {
      templateRow = await Template.findOne({ where: { company_masters_id: company.id, doc_type, template_purpose: "main", is_default: 1, isDelete: 0 } });
    }
    template = templateRow
      ? JSON.parse(templateRow.published_template_json)
      : getTemplate(doc_type, { columnOptions: columnOptions || {} });
    includeProductPages = !!templateRow?.include_product_pages;
  }

  // The itemsTable field's own columnOptions (baked in at save/apply-options
  // time, buildTemplate.js) is the source of truth for what columns this
  // SPECIFIC resolved template's head/columnStyles actually have — a caller-
  // supplied columnOptions must never silently diverge from it, or the row
  // arrays buildInputsForCart produces end up a different length than the
  // table's own column count and the table plugin indexes past the end.
  // An explicit `columnOptions` argument is still honored (Designer toolbar
  // live-apply / preview flows that intentionally override), it just isn't
  // the generate-time default anymore.
  const templateItemsTableField = template.schemas?.[0]?.find((f) => f.name === "itemsTable");
  const resolvedColumnOptions = columnOptions || templateItemsTableField?.columnOptions || {};

  template = withCompanyHeader(template, company);
  template = injectWatermarkField(template, company);

  const computed = buildComputedFields(cart, numberTowords);
  computed.hsnSummary = buildHsnSummary(items);

  template = await injectPaymentQRField(template, {
    docType: doc_type,
    company,
    order,
    payableAmount: computed.payableAmount,
  });

  const cashDiscount = buildCashDiscount(cart);
  const hsnTaxRows = buildHsnTaxRows({ items, cart, isSameState, packingHSN, packingGSTRate, transportHSN, transportGSTRate });

  const rawInputs = buildInputsForCart({
    company,
    buyer,
    order,
    computed,
    items,
    columnOptions: resolvedColumnOptions,
    totals: {
      isSameState,
      packingChargeLabel,
      transportChargeLabel,
      tcsLabel,
      cashDiscountLabel: cashDiscount.label,
      cashDiscountAmount: cashDiscount.amount,
      bankDetails,
      remarks,
      note,
      hsnTaxRows,
    },
  });

  // itemImages isn't a buildInputsForCart param (it's this function's own
  // param, same array overlayItemImages below consumes) — merged here rather
  // than threading it through, same 1:1 index-aligned data-URI shape.
  rawInputs.firstItemImage = itemImages?.[0] || "";

  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
  resolvedInputs = applyTokenSubstitution(template, resolvedInputs);

  template = applyConditionalVisibility(template, resolvedInputs);

  let pdfBytes = await generate({ template, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });

  const tableFields = (template.schemas[0] || []).filter((f) => f.type === "table" && f.columnOptions !== undefined);
  for (const field of tableFields) {
    pdfBytes = await overlayItemImages({
      pdfBytes,
      template,
      tableFieldName: field.name,
      input: resolvedInputs,
      itemImages,
      fontMap,
    });
  }

  const extraPages = buildExtraPages(customFieldRows || [], cartValues || {});

  // Product Page Designer — one splice entry per cart item (in item order,
  // duplicates included if the same product appears twice), right after
  // the main document and before any customFieldRows-driven "after" pages.
  // Deliberately per-line-item, not deduped by product id.
  if (includeProductPages && itemProductIds?.length) {
    const Product = productModel(tenantDB);
    const productIds = [...new Set(itemProductIds.filter(Boolean))];
    // No company_masters_id filter — confirmed against getAllProduct
    // (productServices.js), this table isn't scoped by that column (it
    // sits at 0 on every row in a single-company tenant DB); real scoping
    // is tenant-DB isolation alone (tenantDB is already this company's own
    // isolated database, same as every other product query in the app).
    const products = productIds.length
      ? await Product.findAll({ where: { id: productIds, isDelete: 0 }, attributes: ["id", "document_template_id"] })
      : [];
    const templateIdByProductId = {};
    products.forEach((p) => { if (p.document_template_id) templateIdByProductId[p.id] = p.document_template_id; });

    const productPageEntries = itemProductIds
      .map((productId) => templateIdByProductId[productId])
      .filter(Boolean)
      .map((templateId) => ({ kind: "designerPage", value: String(templateId) }));
    extraPages.after = [...productPageEntries, ...extraPages.after];
  }

  const finalBuffer = await mergeExtraPages(Buffer.from(pdfBytes), template.basePdf, extraPages, company, tenantDB);

  return finalBuffer;
}
