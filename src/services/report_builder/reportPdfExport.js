// Phase 2 — Excel/PDF export for report_definitions. Excel reuses
// exporter.js's exportData() as-is. PDF reuses document_print_templates
// directly (see plan) with the synthetic convention
// doc_type = "report_" + report_definition_id — no new table, no new
// Designer route set, just this file's bootstrap + row-to-inputs mapping on
// top of the SAME service functions/routes Document Designer already uses.
import fs from "fs";
import path from "path";
import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { documentPrintTemplateModel } from "../../models/company_setup/documentPrintTemplateModel.js";
import { reportDefinitionModel } from "../../models/report_builder/reportDefinitionModel.js";
import { EXPORTS_LINK_EXTENDED } from "../../utils/appConstants.js";
import { exportData } from "../../utils/exporter.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { createDocumentTemplate } from "../company_setup/documentPrintTemplateServices.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { tableField, textField } from "../pdfmeEngine/buildTemplate.js";
import { loadFonts } from "../pdfmeEngine/fonts.js";
import {
  applyConditionalVisibility,
  fillMissingInputsFromContent,
  resolveDataSources,
} from "../pdfmeEngine/orderInputMapper.js";
import { runDefinitionByType } from "./reportDefinitionServices.js";

const fontMap = loadFonts();
const pluginMap = { text: plugins.text, table: plugins.table, image: plugins.image };

const reportDocType = (definitionId) => `report_${definitionId}`;

const humanize = (key) =>
  String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

// Same key resolution queryEngine.js uses to build SELECT attributes — kept
// in sync by hand since plugin-type rows never go through queryEngine at
// all (their shape is whatever the wrapped plugin returns, matched to
// columns_json by trust, not by a shared code path).
//
// Plugin-type definitions currently always save columns_json as [] (Phase 1
// decision — no per-column config UI for plugin mode yet, see
// ReportBuilderView.tsx's handleSave comment). Falls back to whatever keys
// the first row actually has, same graceful degradation exporter.js already
// does for Excel — otherwise export/PDF would render a zero-column table.
function resolveDisplayColumns(definition, rows = []) {
  const columns = JSON.parse(definition.columns_json || "[]");
  if (columns.length > 0) {
    return columns.map((c) => {
      const key = c.aggregate ? c.alias || `${c.aggregate}_${c.column}` : c.column;
      return { key, label: c.label || humanize(key) };
    });
  }
  const sample = rows[0];
  return sample ? Object.keys(sample).map((key) => ({ key, label: humanize(key) })) : [];
}

// One-page title + full-height table — the bootstrap starting point a
// report gets before anyone opens the Designer. dataSource is set explicitly
// (buildTemplate.js's tableField helper doesn't default it the way
// textField/imageField do) so a field renamed in the Designer still resolves
// via resolveDataSources() below instead of silently going blank.
function buildDefaultReportTemplate(title, columns) {
  const colCount = Math.max(columns.length, 1);
  const widthPct = Array(colCount).fill(Number((100 / colCount).toFixed(2)));

  return {
    basePdf: { width: 210, height: 297, padding: [15, 10, 15, 10] },
    schemas: [
      [
        textField({
          name: "reportTitle",
          dataSource: "reportTitle",
          position: { x: 10, y: 10 },
          width: 190,
          height: 8,
          fontSize: 13,
          fontName: "Poppins Bold",
          alignment: "center",
          content: title,
        }),
        tableField({
          name: "reportTable",
          dataSource: "reportTable",
          position: { x: 10, y: 22 },
          width: 190,
          height: 255,
          showHead: true,
          head: columns.map((c) => c.label),
          headWidthPercentages: widthPct,
          content: JSON.stringify([columns.map(() => "")]),
          headStyles: {
            backgroundColor: "#cfcfcf",
            fontColor: "#000000",
            fontSize: 8,
            alignment: "center",
            padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
          },
          bodyStyles: {
            fontSize: 7.5,
            alignment: "left",
            padding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
          },
        }),
      ],
    ],
  };
}

// Guarantees at least one document_print_templates row exists for this
// report's doc_type — first export on a brand-new report creates it via the
// EXISTING createDocumentTemplate service function (in-process, not over
// HTTP), so it immediately shows up in "Manage Templates" as a real,
// editable row afterward.
async function ensureDefaultReportTemplate(req, definition, company_masters_id, rows) {
  const doc_type = reportDocType(definition.id);
  const Template = documentPrintTemplateModel(req.tenantDB);
  const existing = await Template.findOne({ where: { company_masters_id, doc_type, isDelete: 0 } });
  if (existing) return doc_type;

  const columns = resolveDisplayColumns(definition, rows);
  const template_json = buildDefaultReportTemplate(definition.name, columns);
  await createDocumentTemplate({
    ...req,
    body: {
      ...req.body,
      company_masters_id,
      doc_type,
      template_name: "Default",
      template_json,
    },
  });
  return doc_type;
}

function ensureUploadDir(subPath) {
  const uploadDir = path.resolve(process.cwd(), subPath);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

async function loadOwnedDefinition(req) {
  const { id } = req.params || {};
  const { a_application_login_id } = req.body || {};
  if (!id || !a_application_login_id) {
    return { error: resError({ developer_msg: "id (param) and a_application_login_id are required" }) };
  }
  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  if (!findCompanyId) {
    return { error: resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" }) };
  }
  const company_masters_id = findCompanyId.company_masters_id;
  const ReportDefinition = reportDefinitionModel(req.tenantDB);
  const definition = await ReportDefinition.findOne({ where: { id, company_masters_id, isDelete: 0 } });
  if (!definition) {
    return { error: resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" }) };
  }
  return { definition, company_masters_id };
}

export const exportReportExcel = async (req, res) => {
  try {
    const { definition, company_masters_id, error } = await loadOwnedDefinition(req);
    if (error) return error;

    const runResult = await runDefinitionByType(definition, req, res);
    if (runResult?.ack !== 1) return runResult;
    const rows = runResult?.data?.rows || [];
    if (!rows.length) {
      return resError({ ack_msg: "No data to export", developer_msg: "Report returned zero rows" });
    }

    const columns = resolveDisplayColumns(definition, rows);
    const keys = columns.map((c) => c.key);
    const headers = Object.fromEntries(columns.map((c) => [c.key, c.label]));

    const uploadDir = ensureUploadDir(`media-folder/exports/report_pdf/${company_masters_id}`);
    const savedPath = await exportData(rows, {
      format: "xlsx",
      fileName: `report_${definition.id}`,
      columns: keys,
      headers,
      autoDownload: false,
      outputDir: uploadDir,
    });
    if (!savedPath) {
      return resError({ developer_msg: "Failed to generate Excel export" });
    }

    const fileUrl = `${EXPORTS_LINK_EXTENDED}report_pdf/${company_masters_id}/${savedPath.file_name}`;
    return resSuccess({ data: { fileUrl, fileName: savedPath.file_name } });
  } catch (e) {
    console.error("exportReportExcel error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const exportReportPdf = async (req, res) => {
  try {
    const { definition, company_masters_id, error } = await loadOwnedDefinition(req);
    if (error) return error;

    const { template_id, disposition } = req.body || {};

    const runResult = await runDefinitionByType(definition, req, res);
    if (runResult?.ack !== 1) return runResult;
    const rows = runResult?.data?.rows || [];

    const doc_type = await ensureDefaultReportTemplate(req, definition, company_masters_id, rows);

    const Template = documentPrintTemplateModel(req.tenantDB);
    const templateRow = template_id
      ? await Template.findOne({ where: { id: template_id, company_masters_id, doc_type, isDelete: 0 } })
      : await Template.findOne({ where: { company_masters_id, doc_type, is_default: 1, isDelete: 0 } });
    if (!templateRow) {
      return resError({ developer_msg: "PDF template not found" });
    }

    const columns = resolveDisplayColumns(definition, rows);
    const tableRows = rows.length
      ? rows.map((row) => columns.map((c) => (row[c.key] === undefined || row[c.key] === null ? "" : String(row[c.key]))))
      : [columns.map(() => "")];

    const rawInputs = {
      reportTitle: definition.name,
      reportTable: JSON.stringify(tableRows),
    };

    const template = JSON.parse(templateRow.published_template_json);
    let resolvedInputs = resolveDataSources(template, rawInputs);
    resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
    const visibleTemplate = applyConditionalVisibility(template, resolvedInputs);

    const pdfBytes = await generate({ template: visibleTemplate, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
    const buffer = Buffer.from(pdfBytes);

    const uploadDir = ensureUploadDir(`media-folder/exports/report_pdf/${company_masters_id}`);
    const fileName = `report_${definition.id}_${Date.now()}.pdf`;
    fs.writeFileSync(path.join(uploadDir, fileName), buffer);

    const fileUrl = `${EXPORTS_LINK_EXTENDED}report_pdf/${company_masters_id}/${fileName}`;
    return resSuccess({ data: { fileUrl, fileName, disposition: disposition === "inline" ? "inline" : "attachment" } });
  } catch (e) {
    console.error("exportReportPdf error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
