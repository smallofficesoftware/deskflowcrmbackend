// Bulk submissions -> PDF and Excel — plan §5/§6. Bulk PDF copies
// reportPdfExport.js's exportReportPdf shape directly (title + table);
// Excel reuses exporter.js's exportData() the same way exportReportExcel
// already does. Both resolve reference/status/related-record ids to labels
// via formBuilderMasterRegistry's batched resolveLabels before rendering —
// never a raw stored id.
import fs from "fs";
import path from "path";
import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { customRectangle } from "../pdfmeEngine/customRectanglePlugin.js";
import { richText } from "../pdfmeEngine/richTextPlugin.js";
import { loadFonts } from "../pdfmeEngine/fonts.js";
import { buildBulkSubmissionsTemplate } from "../pdfmeEngine/formSubmissionTemplate.js";
import { mainTableName, repeaterTableName } from "./formBuilderDdlBuilder.js";
import { exportSubmissionPdf } from "../pdfmeEngine/formSubmissionGenerate.js";
import { resolveMasterLabels, resolveRelatedRecordLabels } from "./formBuilderMasterRegistry.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { resolveFormAccess } from "./formBuilderRights.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { EXPORTS_LINK_EXTENDED } from "../../utils/appConstants.js";
import { exportData } from "../../utils/exporter.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";
import { QueryTypes } from "sequelize";

const fontMap = loadFonts();
const pluginMap = {
  text: richText,
  table: plugins.table,
  image: plugins.image,
  rectangle: customRectangle,
  ellipse: plugins.ellipse,
  line: plugins.line,
  list: plugins.list,
};

const BULK_PDF_ROW_CAP = 2000; // plan §5 — PDF isn't a great format for very large dumps, Excel is unbounded

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

function displayColumnsFor(fields) {
  const cols = [];
  for (const field of fields) {
    if (["section-header", "file", "signature", "image"].includes(field.type)) continue;
    if (field.type === "repeater") {
      cols.push({ key: `_${field.key}_count`, label: `${field.label || field.key} (count)`, repeaterKey: field.key });
      continue;
    }
    cols.push({ key: field.key, label: field.label || field.key, field });
  }
  cols.push({ key: "_status", label: "Status" });
  return cols;
}

async function loadFormAndRows(req) {
  const a_application_login_id = req.body?.a_application_login_id;
  const company = await getCompanyByLoginId(a_application_login_id);
  if (!company) return { error: resError({ ack_msg: "Company not found for login ID" }) };
  const company_masters_id = company.company_masters_id;

  const FormModel = formBuilderFormModel(req.tenantDB);
  const form_id = req.body?.form_id || req.body?.formId;
  const form = await FormModel.findOne({ where: { id: form_id, company_masters_id, isDelete: 0 } });
  if (!form || !form.published_schema_json) return { error: resError({ ack_msg: "Form not found or not published" }) };

  const access = await resolveFormAccess({ form, company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
  if (access.submissionsScope === "none") return { error: resError({ code: 403, ack_msg: "No access" }) };

  const table = mainTableName(form.id);
  const where = ["isDelete = 0"];
  const replacements = {};
  if (access.submissionsScope === "own") {
    where.push("submitted_by_a_application_login_id = :loginId");
    replacements.loginId = a_application_login_id;
  }

  const cap = req.body?.limit && Number(req.body.limit) < 100000 ? Number(req.body.limit) : 100000;
  const rows = await req.tenantDB.query(
    `SELECT * FROM \`${table}\` WHERE ${where.join(" AND ")} ORDER BY created_date_time DESC LIMIT ${cap}`,
    { replacements, type: QueryTypes.SELECT },
  );

  return { form, company_masters_id, rows };
}

async function buildExportRows({ tenantDB, form, fields, rows }) {
  const referenceFields = fields.filter((f) => f.type === "reference");
  const labelMaps = {};
  for (const field of referenceFields) {
    const ids = rows.map((r) => r[field.key]).filter((v) => v != null);
    labelMaps[field.key] = await resolveMasterLabels({ tenantDB, master: field.master, ids });
  }

  const statusIds = rows.map((r) => r.submission_status_id).filter((v) => v != null);
  let statusMap = {};
  if (statusIds.length > 0) {
    const StatusModel = stagestatusModel(tenantDB);
    const statusRows = await StatusModel.findAll({ where: { id: statusIds }, attributes: ["id", "name"], raw: true });
    statusMap = Object.fromEntries(statusRows.map((s) => [s.id, s.name]));
  }

  const repeaterCounts = {};
  const repeaterFields = fields.filter((f) => f.type === "repeater");
  for (const field of repeaterFields) {
    const childTable = repeaterTableName(form.id, field.id);
    const counts = await tenantDB.query(
      `SELECT submission_id, COUNT(*) AS cnt FROM \`${childTable}\` GROUP BY submission_id`,
      { type: QueryTypes.SELECT },
    );
    repeaterCounts[field.key] = Object.fromEntries(counts.map((c) => [c.submission_id, c.cnt]));
  }

  return rows.map((row) => {
    const out = { id: row.id, created_date_time: row.created_date_time };
    for (const field of fields) {
      if (["section-header", "file", "signature", "image"].includes(field.type)) continue;
      if (field.type === "repeater") {
        out[`_${field.key}_count`] = repeaterCounts[field.key]?.[row.id] || 0;
        continue;
      }
      let value = row[field.key];
      if (field.type === "reference" && value != null) value = labelMaps[field.key][value];
      if (field.type === "multi-select" && value) {
        try {
          value = JSON.parse(value).join(", ");
        } catch {
          /* leave as-is */
        }
      }
      out[field.key] = value;
    }
    out._status = row.submission_status_id != null ? statusMap[row.submission_status_id] : null;
    return out;
  });
}

export const exportSubmissionsBulkPdf = async (req) => {
  try {
    const { form, company_masters_id, rows, error } = await loadFormAndRows(req);
    if (error) return error;
    if (!rows.length) return resError({ ack_msg: "No submissions to export" });

    const fields = parseSchema(form.published_schema_json);
    const columns = displayColumnsFor(fields);
    const exportRows = (await buildExportRows({ tenantDB: req.tenantDB, form, fields, rows })).slice(0, BULK_PDF_ROW_CAP);

    const tableRows = exportRows.map((row) => columns.map((c) => (row[c.key] == null ? "" : String(row[c.key]))));
    const template = buildBulkSubmissionsTemplate(form.title, columns);

    const rawInputs = {
      bulkTitle: `${form.title} — Submissions`,
      bulkTable: JSON.stringify(tableRows.length ? tableRows : [columns.map(() => "")]),
    };

    const pdfBytes = await generate({ template, inputs: [rawInputs], plugins: pluginMap, options: { font: fontMap } });
    const buffer = Buffer.from(pdfBytes);

    const uploadDir = ensureUploadDir(`media-folder/exports/form_pdf/${company_masters_id}`);
    const fileName = `form_${form.id}_submissions_${Date.now()}.pdf`;
    fs.writeFileSync(path.join(uploadDir, fileName), buffer);

    const fileUrl = `${EXPORTS_LINK_EXTENDED}form_pdf/${company_masters_id}/${fileName}`;
    return resSuccess({ data: { fileUrl, fileName } });
  } catch (e) {
    console.error("exportSubmissionsBulkPdf error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const exportSubmissionsExcel = async (req) => {
  try {
    const { form, company_masters_id, rows, error } = await loadFormAndRows(req);
    if (error) return error;
    if (!rows.length) return resError({ ack_msg: "No submissions to export" });

    const fields = parseSchema(form.published_schema_json);
    const columns = displayColumnsFor(fields);
    const exportRows = await buildExportRows({ tenantDB: req.tenantDB, form, fields, rows });

    const keys = ["id", "created_date_time", ...columns.map((c) => c.key)];
    const headers = { id: "ID", created_date_time: "Submitted At", ...Object.fromEntries(columns.map((c) => [c.key, c.label])) };

    const uploadDir = ensureUploadDir(`media-folder/exports/form_submissions/${company_masters_id}`);
    const saved = await exportData(exportRows, {
      format: "xlsx",
      fileName: `form_${form.id}_submissions`,
      columns: keys,
      headers,
      autoDownload: false,
      outputDir: uploadDir,
    });
    if (!saved) return resError({ developer_msg: "Failed to generate Excel export" });

    const fileUrl = `${EXPORTS_LINK_EXTENDED}form_submissions/${company_masters_id}/${saved.file_name}`;
    return resSuccess({ data: { fileUrl, fileName: saved.file_name } });
  } catch (e) {
    console.error("exportSubmissionsExcel error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

async function loadPublishedForm(req) {
  const a_application_login_id = req.body?.a_application_login_id;
  const company = await getCompanyByLoginId(a_application_login_id);
  if (!company) return { error: resError({ ack_msg: "Company not found for login ID" }) };
  const company_masters_id = company.company_masters_id;
  const FormModel = formBuilderFormModel(req.tenantDB);
  const form_id = req.body?.form_id || req.body?.formId;
  const form = await FormModel.findOne({ where: { id: form_id, company_masters_id, isDelete: 0 } });
  if (!form || !form.published_schema_json) return { error: resError({ ack_msg: "Form not found or not published" }) };
  return { form, company_masters_id };
}

export const exportSubmissionPdfController = async (req) => {
  try {
    const { form, company_masters_id, error } = await loadPublishedForm(req);
    if (error) return error;

    const { id, template_id } = req.body || {};
    const table = mainTableName(form.id);
    const [row] = await req.tenantDB.query(`SELECT * FROM \`${table}\` WHERE id = :id AND isDelete = 0 LIMIT 1`, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    if (!row) return resError({ ack_msg: "Submission not found" });

    const { fileUrl, fileName } = await exportSubmissionPdf({ req, form, row, company_masters_id, template_id });
    return resSuccess({ data: { fileUrl, fileName } });
  } catch (e) {
    console.error("exportSubmissionPdfController error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
