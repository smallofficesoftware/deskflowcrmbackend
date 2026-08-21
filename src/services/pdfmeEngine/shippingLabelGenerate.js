// Generate-time wrapper for the shipping label, mirroring generateDocument.js's
// shape (resolveDataSources -> fillMissingInputsFromContent ->
// applyConditionalVisibility -> generate()) but without any of the
// cart-invoice-only machinery (HSN, watermark, payment QR, extra pages,
// per-company Designer template lookup) that doesn't apply to a label.
import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { documentPrintTemplateModel } from "../../models/company_setup/documentPrintTemplateModel.js";
import { loadFonts } from "./fonts.js";
import {
  applyConditionalVisibility,
  fillMissingInputsFromContent,
  resolveDataSources,
} from "./orderInputMapper.js";
import { buildShippingLabelTemplate } from "./shippingLabelTemplate.js";

const fontMap = loadFonts();
const pluginMap = { text: plugins.text, table: plugins.table, image: plugins.image };

// Same "₹" + en-IN grouping the old EJS uses (Number(x).toLocaleString('en-IN')).
function formatInr(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

// cart/company/items: same raw rows fetchShippingLabelPrint (orderServices.js)
// already fetches for the EJS path. qrDataUri: PNG data URI (EJS embeds a raw
// <svg> string instead — pdfme's image field needs raster bytes, so the call
// site generates a PNG QR for this path instead of reusing the SVG string).
// showProductSection: printSetting?.ProductSection boolean, same flag the EJS
// template checks. dynamicTerms: same string the EJS path already computes.
export async function generateShippingLabelPdf({
  cart,
  company,
  items,
  qrDataUri,
  dynamicTerms,
  showProductSection,
  documentTemplateId,
  tenantDB,
}) {
  // Same lookup order generateQuotationPdf uses: an explicitly picked
  // template, else the company's own default for this doc_type, else the
  // built-in fixed layout.
  let template = null;
  if (tenantDB) {
    const Template = documentPrintTemplateModel(tenantDB);
    let templateRow = null;
    if (documentTemplateId) {
      templateRow = await Template.findOne({
        where: { id: documentTemplateId, company_masters_id: company?.id, isDelete: 0 },
      });
    }
    if (!templateRow) {
      templateRow = await Template.findOne({
        where: { company_masters_id: company?.id, doc_type: "shippingLabel", is_default: 1, isDelete: 0 },
      });
    }
    if (templateRow) template = JSON.parse(templateRow.published_template_json);
  }
  if (!template) template = buildShippingLabelTemplate();

  const addressParts = [
    cart?.shipping_address || "",
    [cart?.city_name, cart?.state_name].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
  const toAddress = cart?.PinCode ? `${addressParts} - ${cart.PinCode}` : addressParts;

  const rawInputs = {
    toCustomerName: cart?.to_customer_name ?? "",
    toAddress,
    toPhone: cart?.to_customer_phone ? `Phone: ${cart.to_customer_phone}` : "",

    fromCompanyName: company?.company_name ?? "",
    fromAddress: [company?.address, company?.state_name].filter(Boolean).join(", "),
    fromPhone: company?.company_contact ? `Phone: ${company.company_contact}` : "",

    orderNumberText: cart?.sr_by_number ? `Order #: ${cart.sr_by_number}` : "",
    qrImage: qrDataUri || "",

    showProductSection: showProductSection ? "1" : "",
    itemsTable: JSON.stringify(
      (items || []).map((item) => [
        item.item_product_name ?? "",
        String(item.item_qty ?? ""),
        Number(item.item_total || 0).toFixed(2),
      ]),
    ),
    grandTotalText: `Grand Total : ${formatInr(cart?.grand_total)}`,

    termsText: dynamicTerms || "",
  };

  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
  const visibleTemplate = applyConditionalVisibility(template, resolvedInputs);

  const pdfBytes = await generate({ template: visibleTemplate, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
  return Buffer.from(pdfBytes);
}
