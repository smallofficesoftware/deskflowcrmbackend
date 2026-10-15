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
import {
  mainTableName,
  repeaterTableName,
  NO_COLUMN_TYPES,
  NO_COLUMN_NON_REPEATER_TYPES,
} from "../form_builder/formBuilderDdlBuilder.js";
import { resolveMasterLabels, resolveRelatedRecordLabels } from "../form_builder/formBuilderMasterRegistry.js";
import { maskSensitiveValues } from "../form_builder/formBuilderSensitiveValue.js";
import { buildLabelMaps, displayValueFor } from "../form_builder/formBuilderDisplayValues.js";
import { fieldsForExport } from "../form_builder/formBuilderFieldRestrictions.js";
import { approvalOf } from "../form_builder/formBuilderApproval.js";
import { listStageLog } from "../form_builder/formBuilderApprovalService.js";
import { blankLineFor, BLANK_TABLE_ROWS } from "../form_builder/formBuilderBlankForm.js";
import { answersFromStoredRow, emptyModeOf, lineForField, printableFields, printBlocks, LAYOUT_TAG_PREFIX, layoutSignature } from "../form_builder/formBuilderPrintLayout.js";
import { evaluateVisibility } from "../form_builder/formBuilderConditions.js";
import { visibleQuestionIds } from "../form_builder/formBuilderQuestionTable.js";
import { QueryTypes } from "sequelize";
import { formBuilderSubmissionFileModel } from "../../models/form_builder/formBuilderSubmissionFileModel.js";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { sniffImageMime } from "./imageOverlay.js";
import { appendAttachmentPages, MAX_IMAGES_PER_FIELD } from "./formAttachmentPages.js";

export const formSubmissionDocType = (formId) => `form_${formId}`;

// Photo / signature files print as pictures. A file bigger than this is left
// out rather than bloating (or failing) the whole PDF.
const MAX_PRINT_IMAGE_BYTES = 6 * 1024 * 1024;
const MEDIA_ROOT = () => path.resolve(process.cwd(), "media-folder");

// field_key -> "data:image/...;base64,..." for the image / signature fields of
// one submission. Unreadable, missing, oversize or non-PNG/JPEG files are
// skipped (the field then prints nothing, never an error).
async function loadSubmissionImages({ tenantDB, formId, submissionId, fieldKeys }) {
  const out = {};
  if (!submissionId || fieldKeys.length === 0) return out;
  let rows = [];
  try {
    rows = await formBuilderSubmissionFileModel(tenantDB).findAll({
      where: { submission_id: submissionId, form_id: formId, isDelete: 0 },
      order: [["id", "ASC"]],
      raw: true,
    });
  } catch {
    return out;
  }
  const wanted = new Set(fieldKeys);
  for (const file of rows) {
    if (!wanted.has(file.field_key)) continue;
    const image = readStoredImage(file.file_path);
    if (image) out[file.field_key] = `data:${image.mime};base64,${image.bytes.toString("base64")}`; // newest file of the field wins
  }
  return out;
}

// A stored upload as { bytes, mime } when it is a readable PNG / JPEG inside
// media-folder and not oversize; otherwise null.
function readStoredImage(filePath) {
  if (!filePath) return null;
  const root = MEDIA_ROOT();
  const abs = path.resolve(process.cwd(), filePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null; // never read outside media-folder
  try {
    const bytes = fs.readFileSync(abs);
    if (bytes.length === 0 || bytes.length > MAX_PRINT_IMAGE_BYTES) return null;
    const mime = sniffImageMime(bytes);
    return mime === "image/png" || mime === "image/jpeg" ? { bytes, mime } : null;
  } catch {
    return null; // file gone from disk
  }
}

// Attachment ("file") fields of one submission, for the pages appended to the
// PDF: every readable picture (up to MAX_IMAGES_PER_FIELD) and the names of the
// other files. Fields hidden by a rule or restriction are left out.
async function loadAttachmentGroups({ tenantDB, form, fields, row }) {
  if (!row?.id) return [];
  const fileFields = printableFields(fields, row).filter((f) => f.type === "file" && f.key);
  if (fileFields.length === 0) return [];
  let rows = [];
  try {
    rows = await formBuilderSubmissionFileModel(tenantDB).findAll({
      where: { submission_id: row.id, form_id: form.id, isDelete: 0, field_key: fileFields.map((f) => f.key) },
      order: [["id", "ASC"]],
      raw: true,
    });
  } catch {
    return [];
  }
  return fileFields.map((field) => {
    const images = [];
    const others = [];
    let extra = 0;
    for (const file of rows.filter((r) => r.field_key === field.key)) {
      const name = file.original_file_name || file.stored_file_name || "file";
      const image = readStoredImage(file.file_path);
      if (!image) others.push(name);
      else if (images.length < MAX_IMAGES_PER_FIELD) images.push({ name, mime: image.mime, bytes: image.bytes });
      else extra += 1;
    }
    return { label: field.label || field.key, images, others, extra };
  });
}

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
  const fields = parseSchema(form.published_schema_json);
  const existing = await Template.findAll({ where: { company_masters_id, doc_type, isDelete: 0 } });

  if (existing.length > 0) {
    // A template still carrying the auto-layout tag was generated, not edited
    // in Document Designer: keep it in step with the form. An edited template
    // (tag gone) is never touched.
    const tag = `${LAYOUT_TAG_PREFIX}${layoutSignature(fields)}`;
    for (const row of existing) {
      let stored = null;
      try {
        stored = JSON.parse(row.published_template_json);
      } catch {
        stored = null;
      }
      if (stored?.autoLayout && String(stored.autoLayout).startsWith(LAYOUT_TAG_PREFIX) && stored.autoLayout !== tag && !row.has_unpublished_changes) {
        const rebuilt = JSON.stringify(buildDefaultSubmissionTemplate(form.title, fields));
        await row.update({ published_template_json: rebuilt, draft_template_json: rebuilt });
      }
    }
    return doc_type;
  }

  const template_json = buildDefaultSubmissionTemplate(form.title, fields);
  await createDocumentTemplate({
    ...req,
    body: { ...req.body, company_masters_id, doc_type, template_name: "Default", template_json },
  });
  return doc_type;
}

// The Document Designer opens a form's print design (doc_type form_<id>) before
// any PDF was ever printed, when the form has no template row yet. Create the
// default one then, so the designer has a template to work on (otherwise its
// Add Field / Save / Publish stay disabled on a blank canvas). Returns true
// when a template was created.
export async function ensureFormTemplateForDocType(req, doc_type, company_masters_id) {
  const formId = Number(String(doc_type).replace(/^form_/, ""));
  if (!Number.isInteger(formId) || formId <= 0) return false;
  const form = await formBuilderFormModel(req.tenantDB).findOne({
    where: { id: formId, company_masters_id, isDelete: 0 },
  });
  if (!form || !form.published_schema_json) return false; // not published yet: nothing to print
  const withUser = { ...req, body: { ...req.body, a_application_login_id: req.body?.a_application_login_id || req.user?.id } };
  await ensureDefaultFormTemplate(withUser, form, company_masters_id);
  return true;
}

// Label/value text block + repeater tables, resolving reference/status ids
// to labels the same batched way the submissions list does (plan §1) —
// never a raw id in the exported PDF.
// Encrypted Aadhaar values print as XXXXXXXX1234 only (main row and
// repeater rows) — never the ciphertext or the full number.
async function buildSubmissionInputs({ tenantDB, form, fields, row: storedRow, company_masters_id, blank = false }) {
  const row = maskSensitiveValues(fields, storedRow);
  const labelMaps = await buildLabelMaps({ tenantDB, fields, rows: [row] });
  const emptyMode = emptyModeOf(form.published_settings_json);

  // The blocks come from the FULL published schema, exactly like the default
  // template, so every input name lines up; fields this person may not see
  // (restricted) or that a "show only when" rule hides are simply left out of
  // their block.
  const schemaFields = parseSchema(form.published_schema_json);
  const blocks = printBlocks(schemaFields);
  const allowedKeys = new Set(blank ? fields.map((f) => f.key) : printableFields(fields, row).map((f) => f.key));
  const isAllowed = (f) => !f.key || allowedKeys.has(f.key) || f.type === "instruction";

  const rawInputs = { submissionTitle: form.title };
  const legacyLines = []; // the single "details" text older, hand-made templates use

  // Photos / signatures: the picture goes to <key>_image, its caption to
  // <key>_image_label; both stay empty (and so are left out of the PDF) when
  // the field has no readable file, is not allowed, or this is a blank form.
  const imageFields = blocks.filter((b) => b.kind === "images").flatMap((b) => b.fields);
  const images = blank
    ? {}
    : await loadSubmissionImages({
        tenantDB,
        formId: form.id,
        submissionId: row.id,
        fieldKeys: imageFields.filter(isAllowed).map((f) => f.key),
      });
  for (const field of imageFields) {
    const picture = isAllowed(field) ? images[field.key] || "" : "";
    rawInputs[`${field.key}_image`] = picture;
    rawInputs[`${field.key}_image_label`] = picture ? field.label || field.key : "";
  }

  for (const block of blocks) {
    if (block.kind === "text") {
      const lines = [];
      for (const field of block.fields) {
        if (!isAllowed(field)) continue;
        if (!blank && NO_COLUMN_TYPES.has(field.type) && field.type !== "instruction") continue; // uploads, signatures: not printed here
        const line = blank ? blankLineFor(field) : lineForField(field, displayValueFor(field, row[field.key], labelMaps), emptyMode);
        if (line) lines.push(line);
      }
      if (block.title) rawInputs[`blk_${block.index}_title`] = block.title;
      rawInputs[`blk_${block.index}_body`] = lines.join("\n");
      if (block.title) legacyLines.push(`\n${String(block.title).toUpperCase()}`);
      legacyLines.push(...lines);
    } else if (block.kind === "qtable") {
      const field = block.field;
      if (!isAllowed(field)) continue;
      const columns = Array.isArray(field.answer_columns) && field.answer_columns.length ? field.answer_columns : [{ key: "answer", label: "Answer" }];
      let grid = {};
      try {
        grid = row[field.key] ? JSON.parse(row[field.key]) : {};
      } catch {
        grid = {};
      }
      const answers = answersFromStoredRow(schemaFields, row);
      const visibleIds = visibleQuestionIds(field, answers, schemaFields, evaluateVisibility(schemaFields, answers));
      const rows = (field.questions || [])
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => blank || visibleIds.has(String(q.id)))
        .map(({ q, i }) => [String(i + 1), q.text || "", ...columns.map((c) => (blank ? "" : grid?.[String(q.id)]?.[c.key] == null ? "" : String(grid[String(q.id)][c.key]))) ]);
      rawInputs[`${field.key}_qtable_heading`] = field.label || field.key;
      rawInputs[`${field.key}_qtable`] = JSON.stringify(rows.length ? rows : [["", "", ...columns.map(() => "")]]);
      const printed = displayValueFor(field, row[field.key], labelMaps);
      if (printed && !blank) legacyLines.push(`${field.label || field.key}:\n${printed}`);
    }
  }

  // Approval sign-offs (plan I7): who signed off each stage and when.
  const approvalLines = [];
  if (!blank && approvalOf(form.published_settings_json).enabled && row.id) {
    const log = await listStageLog({ tenantDB, form_id: form.id, submission_id: row.id });
    const signed = log.filter((entry) => entry.action === "submit" || entry.action === "approve");
    if (signed.length > 0) {
      approvalLines.push("Approvals");
      for (const entry of signed) {
        approvalLines.push(`${entry.stage_name}: ${entry.by} — ${new Date(entry.created_date_time).toLocaleString("en-IN", { hour12: false })}`);
      }
    }
  }
  rawInputs.approvals_body = approvalLines.join("\n");
  if (approvalLines.length) legacyLines.push("\n" + approvalLines.join("\n"));

  if (row.related_module && row.related_record_id) {
    const labels = await resolveRelatedRecordLabels({ tenantDB, relatedModule: row.related_module, ids: [row.related_record_id] });
    const linked = `Linked ${row.related_module}: ${labels[row.related_record_id] || row.related_record_id}`;
    legacyLines.push(linked);
    // On the new layout the link joins the last text block.
    const lastText = [...blocks].reverse().find((b) => b.kind === "text");
    if (lastText) rawInputs[`blk_${lastText.index}_body`] = [rawInputs[`blk_${lastText.index}_body`], linked].filter(Boolean).join("\n");
  }
  // Templates made before the sectioned layout (or edited by hand) read one combined block.
  rawInputs.submissionDetails = legacyLines.join("\n");

  for (const field of fields) {
    if (field.type !== "repeater") continue;
    const childTable = repeaterTableName(form.id, field.id);
    const storedChildRows = await tenantDB.query(
      `SELECT * FROM \`${childTable}\` WHERE submission_id = :id ORDER BY row_order ASC`,
      { replacements: { id: row.id }, type: QueryTypes.SELECT },
    );
    const childRows = storedChildRows.map((r) => maskSensitiveValues(field.columns || [], r));
    const columns = (field.columns || []).filter((c) => !NO_COLUMN_NON_REPEATER_TYPES.has(c.type));
    const tableRows = childRows.length
      ? childRows.map((r) => columns.map((c) => (r[c.key] == null ? "" : String(r[c.key]))))
      : Array.from({ length: blank ? BLANK_TABLE_ROWS : 1 }, () => columns.map(() => ""));
    rawInputs[`${field.key}_heading`] = field.label || field.key;
    rawInputs[`${field.key}_table`] = JSON.stringify(tableRows);
  }

  const company = await resolveCompanyForPdf(company_masters_id);
  return { rawInputs, company };
}

export async function generateSubmissionPdf({ req, form, row, company_masters_id, template_id, restrictions = null, blank = false }) {
  // Fields hidden from this user (plan O8) are left out completely.
  const fields = fieldsForExport(parseSchema(form.published_schema_json), restrictions);
  const doc_type = await ensureDefaultFormTemplate(req, form, company_masters_id);

  const Template = documentPrintTemplateModel(req.tenantDB);
  const templateRow = template_id
    ? await Template.findOne({ where: { id: template_id, company_masters_id, doc_type, isDelete: 0 } })
    : await Template.findOne({ where: { company_masters_id, doc_type, is_default: 1, isDelete: 0 } });
  if (!templateRow) throw new Error("PDF template not found");

  const { rawInputs, company } = await buildSubmissionInputs({ tenantDB: req.tenantDB, form, fields, row, company_masters_id, blank });

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

  // Attachment fields: their pictures go on extra pages after the form. A
  // failure here must never lose the PDF itself.
  if (!blank) {
    try {
      const groups = await loadAttachmentGroups({ tenantDB: req.tenantDB, form, fields, row });
      const withAttachments = await appendAttachmentPages(pdfBytes, { title: form.title, groups });
      return Buffer.from(withAttachments);
    } catch (error) {
      console.error("form PDF: attachment pages skipped:", error?.message);
    }
  }
  return Buffer.from(pdfBytes);
}

export async function exportSubmissionPdf({ req, form, row, company_masters_id, template_id, restrictions = null, blank = false }) {
  const buffer = await generateSubmissionPdf({ req, form, row, company_masters_id, template_id, restrictions, blank });

  const uploadDir = ensureUploadDir(`media-folder/exports/form_pdf/${company_masters_id}`);
  const fileName = blank ? `form_${form.id}_blank_${Date.now()}.pdf` : `form_${form.id}_submission_${row.id}_${Date.now()}.pdf`;
  fs.writeFileSync(path.join(uploadDir, fileName), buffer);

  const fileUrl = `${EXPORTS_LINK_EXTENDED}form_pdf/${company_masters_id}/${fileName}`;
  return { fileUrl, fileName };
}

// Every entry on its own page(s), all in one PDF (plan K4): the same layout as
// a single entry's PDF, repeated for each row. `rows` are the stored rows,
// already restricted for this user. Returns { fileUrl, fileName }.
export const BULK_PAGES_CAP = 100;
export async function exportSubmissionsPagesPdf({ req, form, rows, company_masters_id, restrictions = null, template_id }) {
  const fields = fieldsForExport(parseSchema(form.published_schema_json), restrictions);
  const doc_type = await ensureDefaultFormTemplate(req, form, company_masters_id);

  const Template = documentPrintTemplateModel(req.tenantDB);
  const templateRow = template_id
    ? await Template.findOne({ where: { id: template_id, company_masters_id, doc_type, isDelete: 0 } })
    : await Template.findOne({ where: { company_masters_id, doc_type, is_default: 1, isDelete: 0 } });
  if (!templateRow) throw new Error("PDF template not found");

  let template = JSON.parse(templateRow.published_template_json);
  const inputsList = [];
  for (const row of rows.slice(0, BULK_PAGES_CAP)) {
    const { rawInputs, company } = await buildSubmissionInputs({ tenantDB: req.tenantDB, form, fields, row, company_masters_id });
    if (company) {
      rawInputs.companyName = company.name || "";
      rawInputs.companyAddress = company.address || "";
      rawInputs.companyGSTIN = company.gstin || "";
      rawInputs.companyMobile = company.mobile || "";
      rawInputs.companyEmail = company.email || "";
      if (inputsList.length === 0) template = withCompanyHeader(template, company);
    }
    inputsList.push(fillMissingInputsFromContent(template, resolveDataSources(template, rawInputs)));
  }
  if (inputsList.length === 0) throw new Error("No entries to print");

  const pdfBytes = await generate({ template, inputs: inputsList, plugins: pluginMap, options: { font: fontMap } });
  const uploadDir = ensureUploadDir(`media-folder/exports/form_pdf/${company_masters_id}`);
  const fileName = `form_${form.id}_entries_${Date.now()}.pdf`;
  fs.writeFileSync(path.join(uploadDir, fileName), Buffer.from(pdfBytes));
  return { fileUrl: `${EXPORTS_LINK_EXTENDED}form_pdf/${company_masters_id}/${fileName}`, fileName };
}
