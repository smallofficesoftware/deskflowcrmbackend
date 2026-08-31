// Generate-time wrapper for contact address label / envelope prints, mirroring
// shippingLabelGenerate.js's shape (resolveDataSources -> fillMissingInputsFromContent
// -> applyTokenSubstitution -> applyConditionalVisibility -> generate()).
// Both doc types share the same raw-input composition (contact + company data)
// and template-resolution lookup, only the fallback template builder differs.
import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { documentPrintTemplateModel } from "../../models/company_setup/documentPrintTemplateModel.js";
import { buildContactAddressTemplate } from "./contactAddressTemplate.js";
import { buildContactEnvelopeTemplate } from "./contactEnvelopeTemplate.js";
import { loadFonts } from "./fonts.js";
import {
  applyConditionalVisibility,
  applyTokenSubstitution,
  fillMissingInputsFromContent,
  resolveDataSources,
} from "./orderInputMapper.js";

const fontMap = loadFonts();
const pluginMap = { text: plugins.text, table: plugins.table, image: plugins.image };

// Same lookup order generateShippingLabelPdf/generateQuotationPdf use: an
// explicitly picked template, else the company's own default for this
// doc_type, else the built-in fixed layout.
async function resolveContactTemplate(tenantDB, companyId, docType, documentTemplateId, fallbackBuilder) {
  let template = null;
  if (tenantDB) {
    const Template = documentPrintTemplateModel(tenantDB);
    let templateRow = null;
    if (documentTemplateId) {
      templateRow = await Template.findOne({
        where: { id: documentTemplateId, company_masters_id: companyId, doc_type: docType, template_purpose: "main", isDelete: 0 },
      });
    }
    if (!templateRow) {
      templateRow = await Template.findOne({
        where: { company_masters_id: companyId, doc_type: docType, template_purpose: "main", is_default: 1, isDelete: 0 },
      });
    }
    if (templateRow) template = JSON.parse(templateRow.published_template_json);
  }
  return template || fallbackBuilder();
}

function buildContactRawInputs({ contact, company }) {
  const toLocationParts = [contact?.area_name, contact?.city_name, contact?.state_name, contact?.country_name].filter(Boolean).join(", ");
  const toLocationLine = contact?.pincode ? `${toLocationParts} - ${contact.pincode}` : toLocationParts;

  return {
    toName: contact?.person_name ? `Name: ${contact.person_name}` : "",
    toCompanyName: contact?.company_name ? `Company: ${contact.company_name}` : "",
    toPhone: contact?.mobile_number ? `Contact No.: ${contact.mobile_number}` : "",
    toEmail: contact?.email_id ? `Email: ${contact.email_id}` : "",
    toLocationLine,
    toAddress: contact?.address ? `Address: ${contact.address}` : "",

    fromCompanyName: company?.company_name ? `Company: ${company.company_name}` : "",
    fromLocationLine: [company?.city_name, company?.state_name].filter(Boolean).join(", "),
    fromPhone: company?.company_contact ? `Contact No.: ${company.company_contact}` : "",
    fromEmail: company?.company_email ? `Email: ${company.company_email}` : "",
    fromAddress: company?.address ? `Address: ${company.address}` : "",
  };
}

async function generateContactPdf(docType, fallbackBuilder, { contact, company, documentTemplateId, tenantDB }) {
  const template = await resolveContactTemplate(tenantDB, company?.id, docType, documentTemplateId, fallbackBuilder);
  const rawInputs = buildContactRawInputs({ contact, company });

  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
  resolvedInputs = applyTokenSubstitution(template, resolvedInputs);
  const visibleTemplate = applyConditionalVisibility(template, resolvedInputs);

  const pdfBytes = await generate({ template: visibleTemplate, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
  return Buffer.from(pdfBytes);
}

export async function generateContactAddressPdf(args) {
  return generateContactPdf("contactAddress", buildContactAddressTemplate, args);
}

export async function generateContactEnvelopePdf(args) {
  return generateContactPdf("contactEnvelope", buildContactEnvelopeTemplate, args);
}
