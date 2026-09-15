// Single-submission PDF — plan §5. Reuses document_print_templates exactly
// as reportPdfExport.js already reuses it for reports (synthetic
// doc_type = "form_" + form_id, no new table), and the same
// resolveDataSources/fillMissingInputsFromContent/applyConditionalVisibility
// pipeline every other doc type's PDF generation already goes through.
import fs from "fs";
import path from "path";
import { generate } from "@pdfme/generator";
import { documentPrintTemplateModel } from "../../models/company_setup/documentPrintTemplateModel.js";
import { EXPORTS_LINK_EXTENDED } from "../../utils/appConstants.js";
import { createDocumentTemplate, resolveCompanyForPdf } from "../company_setup/documentPrintTemplateServices.js";
import { fontMap } from "./fonts.js";
import { applyConditionalVisibility, fillMissingInputsFromContent, resolveDataSources } from "./orderInputMapper.js";
import { pluginMap } from "./pluginMap.js";
import { withCompanyHeader } from "./templates.js";
import { buildDefaultSubmissionTemplate } from "./formSubmissionTemplate.js";
import { mainTableName, repeaterTableName } from "../form_builder/formBuilderDdlBuilder.js";
import { resolveMasterLabels, resolveRelatedRecordLabels } from "../form_builder/formBuilderMasterRegistry.js";
import { QueryTypes } from "sequelize";

export const formSubmissionDocType = (formId) => `form_${formId}`;

function parseSchema(json) {
  if (!json) return [];
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ensureUploadDir(subPath) {
  const uploadDir = path.resolve(process.cwd(), subPath);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
}

async function ensureDefaultFormTemplate(req, form, company_masters_id) {
  const doc_type = formSubmissionDocType(form.id);
  const Template = documentPrintTemplateModel(req.tenantDB);
  const existing = await Template.findOne({ where: { company_masters_id, doc_type, isDelete: 0 } });
  if (existing) return doc_type;

  const fields = parseSchema(form.published_schema_json);
  const template_json = buildDefaultSubmissionTemplate(form.title, fields);
  await createDocumentTemplate({
    ...req,
    body: { ...req.body, company_masters_id, doc_type, template_name: "Default", template_json },
  });
  return doc_type;
}

// Label/value text block + repeater tables, resolving reference/status ids
// to labels the same batched way the submissions list does (plan §1) —
// never a raw id in the exported PDF.
async function buildSubmissionInputs({ tenantDB, form, fields, row, company_masters_id }) {
  const lines = [];
  for (const field of fields) {
    if (["section-header", "file", "signature", "image", "repeater"].includes(field.type)) continue;
    let value = row[field.key];
    if (field.type === "reference" && value != null) {
      const labels = await resolveMasterLabels({ tenantDB, master: field.master, ids: [value] });
      value = labels[value] || value;
    }
    if (field.type === "multi-select" && value) {
      try {
        value = JSON.parse(value).join(", ");
      } catch {
        /* leave as-is */
      }
    }
    lines.push(`${field.label || field.key}: ${value == null || value === "" ? "-" : value}`);
  }

  if (row.related_module && row.related_record_id) {
    const labels = await resolveRelatedRecordLabels({ tenantDB, relatedModule: row.related_module, ids: [row.related_record_id] });
    lines.push(`Linked ${row.related_module}: ${labels[row.related_record_id] || row.related_record_id}`);
  }

  const rawInputs = {
    submissionTitle: form.title,
    submissionDetails: lines.join("\n"),
  };

  for (const field of fields) {
    if (field.type !== "repeater") continue;
    const childTable = repeaterTableName(form.id, field.id);
    const childRows = await tenantDB.query(
      `SELECT * FROM \`${childTable}\` WHERE submission_id = :id ORDER BY row_order ASC`,
      { replacements: { id: row.id }, type: QueryTypes.SELECT },
    );
    const columns = (field.columns || []).filter((c) => !["file", "signature", "image", "section-header"].includes(c.type));
    const tableRows = childRows.length
      ? childRows.map((r) => columns.map((c) => (r[c.key] == null ? "" : String(r[c.key]))))
      : [columns.map(() => "")];
    rawInputs[`${field.key}_heading`] = field.label || field.key;
    rawInputs[`${field.key}_table`] = JSON.stringify(tableRows);
  }

  const company = await resolveCompanyForPdf(company_masters_id);
  return { rawInputs, company };
}

export async function generateSubmissionPdf({ req, form, row, company_masters_id, template_id }) {
  const fields = parseSchema(form.published_schema_json);
  const doc_type = await ensureDefaultFormTemplate(req, form, company_masters_id);

  const Template = documentPrintTemplateModel(req.tenantDB);
  const templateRow = template_id
    ? await Template.findOne({ where: { id: template_id, company_masters_id, doc_type, isDelete: 0 } })
    : await Template.findOne({ where: { company_masters_id, doc_type, is_default: 1, isDelete: 0 } });
  if (!templateRow) throw new Error("PDF template not found");

  const { rawInputs, company } = await buildSubmissionInputs({ tenantDB: req.tenantDB, form, fields, row, company_masters_id });

  let template = JSON.parse(templateRow.published_template_json);
  if (company) {
    rawInputs.companyName = company.name || "";
    rawInputs.companyAddress = company.address || "";
    rawInputs.companyGSTIN = company.gstin || "";
    rawInputs.companyMobile = company.mobile || "";
    rawInputs.companyEmail = company.email || "";
    template = withCompanyHeader(template, company);
  }

  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
  const visibleTemplate = applyConditionalVisibility(template, resolvedInputs);

  const pdfBytes = await generate({ template: visibleTemplate, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
  return Buffer.from(pdfBytes);
}

export async function exportSubmissionPdf({ req, form, row, company_masters_id, template_id }) {
  const buffer = await generateSubmissionPdf({ req, form, row, company_masters_id, template_id });

  const uploadDir = ensureUploadDir(`media-folder/exports/form_pdf/${company_masters_id}`);
  const fileName = `form_${form.id}_submission_${row.id}_${Date.now()}.pdf`;
  fs.writeFileSync(path.join(uploadDir, fileName), buffer);

  const fileUrl = `${EXPORTS_LINK_EXTENDED}form_pdf/${company_masters_id}/${fileName}`;
  return { fileUrl, fileName };
}
