// Generate-time wrappers for the 4 job card doc types (ticket #2212), same
// shape as shippingLabelGenerate.js: resolveTemplate (explicit override ->
// company's saved document_print_templates row -> built-in buildXTemplate())
// then renderPdf(). Data shapes (contactDetail/itemDetail/bomProcesses/
// entries/entry) are exactly what jobCardPdfServices.js already builds for
// the EJS path (sourced from JobCardServices.js's jobCardsDetails()/
// fetchProductionList()/fetchProductionEntryDetail()) - reused as-is, not
// refetched here.
import { documentPrintTemplateModel } from "../../models/company_setup/documentPrintTemplateModel.js";
import { renderPdf } from "./renderPdf.js";
import {
  buildJobCardMasterTemplate,
  buildJobCardTemplate,
  buildProductionEntryReceiptTemplate,
  buildRequiredMaterialTemplate,
} from "./jobCardTemplate.js";

const num = (v) => Number(v) || 0;
const fmt = (v) => {
  const s = num(v).toFixed(3);
  return s.replace(/\.?0+$/, "");
};
const f3 = (v) => num(v).toFixed(3);
const dash = (v) => (v === undefined || v === null || v === "" ? "—" : v);
const pendingOf = (m) => Math.max(0, num(m.required_qty) - num(m.consumed_qty));
const diffOf = (m) => num(m.available_qty) - pendingOf(m);

async function resolveTemplate({ docType, company, documentTemplateId, tenantDB, templateOverride, fallbackBuilder }) {
  let template = templateOverride || null;
  if (!template && tenantDB) {
    const Template = documentPrintTemplateModel(tenantDB);
    let templateRow = null;
    if (documentTemplateId) {
      templateRow = await Template.findOne({
        where: { id: documentTemplateId, company_masters_id: company?.id, doc_type: docType, template_purpose: "main", isDelete: 0 },
      });
    }
    if (!templateRow) {
      templateRow = await Template.findOne({
        where: { company_masters_id: company?.id, doc_type: docType, template_purpose: "main", is_default: 1, isDelete: 0 },
      });
    }
    if (templateRow) template = JSON.parse(templateRow.published_template_json);
  }
  return template || fallbackBuilder();
}

function companyInputs(companyDetail) {
  return {
    companyName: companyDetail?.company_name ?? "",
    companyAddress: companyDetail?.address ?? "",
    companyContactLine: [
      companyDetail?.company_contact ? `Mo. ${companyDetail.company_contact}` : null,
      companyDetail?.company_email || null,
    ].filter(Boolean).join(" | "),
    companyGSTIN: companyDetail?.gst_number ? `GSTIN: ${companyDetail.gst_number}` : "",
  };
}

// Flattens bomProcesses (same shape jobCardsDetails() returns: [{process_name, consumption: [...], rejection: [...]}])
// into MATERIAL_TABLE_COLUMNS rows, one row per material per process.
function flattenMaterialRows(bomProcesses) {
  const rows = [];
  (bomProcesses || []).forEach((process) => {
    [["Consumption", process.consumption || []], ["Rejection", process.rejection || []]].forEach(([label, materials]) => {
      materials.forEach((m) => {
        rows.push([
          process.process_name || "",
          label,
          `${m.material_name} (${m.unit})`,
          f3(m.required_qty),
          f3(m.available_qty),
          f3(m.consumed_qty),
          f3(diffOf(m)),
        ]);
      });
    });
  });
  return rows;
}

export async function generateJobCardPdf({ jobCardId, contactDetail, itemDetail, companyDetail, company, documentTemplateId, tenantDB, templateOverride = null }) {
  const template = await resolveTemplate({
    docType: "jobCard", company: company || companyDetail, documentTemplateId, tenantDB, templateOverride,
    fallbackBuilder: buildJobCardTemplate,
  });

  const rawInputs = {
    ...companyInputs(companyDetail),
    jobCardNoText: `Job Card #${jobCardId}`,
    customerName: dash(contactDetail?.name),
    customerPhone: dash(contactDetail?.phone),
    customerEmail: dash(contactDetail?.email),
    customerGSTIN: dash(contactDetail?.gst_no),
    customerAddress: dash(contactDetail?.address),
    itemName: dash(itemDetail?.item_name),
    itemCode: dash(itemDetail?.item_code),
    orderNo: dash(itemDetail?.order_no),
    deliveryDate: dash(itemDetail?.delivery_date),
    orderQtyLine: `Order Qty: ${itemDetail?.order_qty ?? 0} ${itemDetail?.unit || ""}`,
  };

  return renderPdf(template, rawInputs);
}

export async function generateJobCardMasterPdf({ jobCardId, contactDetail, itemDetail, bomProcesses, entries, totalProduced, companyDetail, company, documentTemplateId, tenantDB, templateOverride = null }) {
  const template = await resolveTemplate({
    docType: "jobCardMaster", company: company || companyDetail, documentTemplateId, tenantDB, templateOverride,
    fallbackBuilder: buildJobCardMasterTemplate,
  });

  const materialRows = flattenMaterialRows(bomProcesses);
  const historyRows = (entries || []).map((e) => [
    `#${e.id}`,
    e.entry_date ?? "",
    String(e.produced_qty ?? 0),
    String(e.consumption_count ?? 0),
    String(e.rejection_count ?? 0),
    dash(e.remark),
  ]);

  const rawInputs = {
    ...companyInputs(companyDetail),
    jobCardNoText: `Job Card #${jobCardId}`,
    customerName: dash(contactDetail?.name),
    customerPhone: dash(contactDetail?.phone),
    itemLine: `${dash(itemDetail?.item_name)} (${itemDetail?.item_code || ""})`,
    orderNo: dash(itemDetail?.order_no),
    targetQtyLine: `${itemDetail?.order_qty ?? 0} ${itemDetail?.unit || ""}`,
    totalProducedLine: `${fmt(totalProduced)} ${itemDetail?.unit || ""}`,
    hasMaterials: materialRows.length ? "1" : "",
    materialsTable: JSON.stringify(materialRows),
    hasHistory: historyRows.length ? "1" : "",
    historyTable: JSON.stringify(historyRows),
  };

  return renderPdf(template, rawInputs);
}

export async function generateRequiredMaterialPdf({ jobCardId, itemName, bomProcesses, companyDetail, company, documentTemplateId, tenantDB, templateOverride = null }) {
  const template = await resolveTemplate({
    docType: "requiredMaterial", company: company || companyDetail, documentTemplateId, tenantDB, templateOverride,
    fallbackBuilder: buildRequiredMaterialTemplate,
  });

  const rawInputs = {
    ...companyInputs(companyDetail),
    jobCardNoText: `Job Card #${jobCardId}`,
    itemLine: `Item: ${itemName || ""}`,
    materialsTable: JSON.stringify(flattenMaterialRows(bomProcesses)),
  };

  return renderPdf(template, rawInputs);
}

export async function generateProductionEntryReceiptPdf({ jobCardId, itemName, entry, companyDetail, company, documentTemplateId, tenantDB, templateOverride = null }) {
  const template = await resolveTemplate({
    docType: "productionEntryReceipt", company: company || companyDetail, documentTemplateId, tenantDB, templateOverride,
    fallbackBuilder: buildProductionEntryReceiptTemplate,
  });

  const matRow = (m) => [m.material_name || `Material ID: ${m.material_id}`, String(m.process_id ?? ""), `${m.qty ?? ""} ${m.unit || ""}`];

  const rawInputs = {
    ...companyInputs(companyDetail),
    jobCardNoText: `#${jobCardId}`,
    entryIdText: `#${entry?.id ?? ""}`,
    itemName: itemName || "",
    entryDateText: entry?.entry_date ?? "",
    producedQtyText: String(entry?.produced_qty ?? ""),
    remarkText: dash(entry?.remark),
    consumedTable: JSON.stringify((entry?.consumption_items || []).map(matRow)),
    rejectedTable: JSON.stringify((entry?.rejection_items || []).map(matRow)),
  };

  return renderPdf(template, rawInputs);
}
