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
import { customRectangle } from "../pdfmeEngine/customRectanglePlugin.js";
import { documentPrintTemplateModel } from "../../models/company_setup/documentPrintTemplateModel.js";
import { reportDefinitionModel } from "../../models/report_builder/reportDefinitionModel.js";
import { EXPORTS_LINK_EXTENDED } from "../../utils/appConstants.js";
import { exportData } from "../../utils/exporter.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { createDocumentTemplate, resolveCompanyForPdf } from "../company_setup/documentPrintTemplateServices.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { buildDocTemplate, tableField, textField } from "../pdfmeEngine/buildTemplate.js";
import { loadFonts } from "../pdfmeEngine/fonts.js";
import {
  applyConditionalVisibility,
  fillMissingInputsFromContent,
  resolveDataSources,
} from "../pdfmeEngine/orderInputMapper.js";
import { withCompanyHeader } from "../pdfmeEngine/templates.js";
import { getRegisteredModel } from "./modelRegistry.js";
import { runDefinitionByType } from "./reportDefinitionServices.js";

const fontMap = loadFonts();
// Matches the report Designer's own plugin set (ReportPdfTemplateDesigner.tsx)
// so a rectangle/ellipse/line/list field dragged onto the canvas there
// actually renders here instead of generate() throwing on an unregistered type.
const pluginMap = {
  text: plugins.text,
  table: plugins.table,
  image: plugins.image,
  rectangle: customRectangle,
  ellipse: plugins.ellipse,
  line: plugins.line,
  list: plugins.list,
};
const A4_HEIGHT = 297;

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
//
// basePdf (company header variant/logo/footer image + page-number field) is
// NOT reinvented here — it's lifted straight off buildDocTemplate(), the same
// builder Document Designer's cart docs use, so a report PDF gets the exact
// same company-branding zone (and exportReportPdf's withCompanyHeader() call
// below fills it with the real company, same as generateQuotationPdf does).
// Only the BODY differs: buyer/items/HSN-totals/signature don't apply to a
// generic rows+columns report, so the body stays just title+table.
function buildDefaultReportTemplate(title, columns) {
  const colCount = Math.max(columns.length, 1);
  const widthPct = Array(colCount).fill(Number((100 / colCount).toFixed(2)));

  const { basePdf } = buildDocTemplate(title, { headerVariant: "details", footerImage: false });
  const [topPadding, , bottomPadding] = basePdf.padding;
  const titleY = topPadding;
  const tableY = titleY + 12;

  return {
    basePdf,
    schemas: [
      [
        textField({
          name: "reportTitle",
          dataSource: "reportTitle",
          position: { x: 10, y: titleY },
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
          position: { x: 10, y: tableY },
          width: 190,
          height: Number((A4_HEIGHT - tableY - bottomPadding).toFixed(2)),
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

// A small "what was this export filtered by" summary, additive to
// rawInputs below — a default/existing template never references
// "appliedFilters" so it goes unused (fillMissingInputsFromContent's own
// "unknown input ignored" behavior), but a custom template CAN bind a
// textField's dataSource to it. Query-type only: plugin's filters_json is a
// differently-shaped {paramKey:value} object with no column-registry
// labels to resolve, and composite has no filters at all today.
function buildAppliedFiltersSummary(definition, req) {
  if (definition.type !== "query" || !definition.model_key) return "";
  const registryEntry = getRegisteredModel(definition.model_key);
  if (!registryEntry) return "";

  const staticFilters = (() => {
    try {
      const parsed = JSON.parse(definition.filters_json || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  // Runtime overrides (the run screen's general-filter/CheckBoxFilterModal
  // selections for THIS export) win per column — same "last one wins"
  // merge queryEngine.js's own combined filters array already relies on.
  const runtimeFilters = Array.isArray(req.body?.filters) ? req.body.filters : [];
  const merged = new Map();
  [...staticFilters, ...runtimeFilters].forEach((f) => {
    if (f && f.column && f.value !== undefined && f.value !== null && f.value !== "") {
      merged.set(f.column, f.value);
    }
  });

  return [...merged.entries()]
    .map(([column, value]) => {
      const label = registryEntry.columns?.[column]?.label || humanize(column);
      const displayValue = Array.isArray(value) ? value.join(", ") : String(value);
      return `${label}: ${displayValue}`;
    })
    .join(", ");
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

// Shared by exportReportPdf (published template, writes a file) and
// previewReportPdf (draft template, no file/no disk write) — same
// rawInputs shape + company-header injection either way, only WHICH
// template_json string gets parsed differs.
async function resolveReportInputsAndTemplate(req, definition, company_masters_id, rows, templateJsonString) {
  const columns = resolveDisplayColumns(definition, rows);
  const tableRows = rows.length
    ? rows.map((row) => columns.map((c) => (row[c.key] === undefined || row[c.key] === null ? "" : String(row[c.key]))))
    : [columns.map(() => "")];

  const rawInputs = {
    reportTitle: definition.name,
    reportTable: JSON.stringify(tableRows),
    appliedFilters: buildAppliedFiltersSummary(definition, req),
  };

  let template = JSON.parse(templateJsonString);
  const company = await resolveCompanyForPdf(company_masters_id);
  if (company) {
    // Same keys dataDictionary.js's REPORT_DICTIONARY lists under "Company" —
    // withCompanyHeader() only fills the STATIC header-zone fields
    // (buildHeaderFields' own companyName/companyAddress/... dataSource
    // keys); a field the user drags onto the report body and binds to one
    // of these needs the plain rawInputs->resolveDataSources path instead,
    // same as CART_DOC_DICTIONARY's own "Company" group already gets via
    // buildInputsForCart (orderInputMapper.js).
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
  return { resolvedInputs, visibleTemplate };
}

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

    const { resolvedInputs, visibleTemplate } = await resolveReportInputsAndTemplate(
      req,
      definition,
      company_masters_id,
      rows,
      templateRow.published_template_json,
    );

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

// Report Designer's own "Generate Preview" — mirrors
// documentPrintTemplateServices.js's previewDocumentTemplate (draft, not
// published; no file/disk write, base64 straight back) but against LIVE
// report data instead of a cart/sample — a report has no fixed schema to
// fake sample rows for, unlike the cart doc types' getSampleDataForPreview.
export const previewReportPdf = async (req, res) => {
  try {
    const { definition, company_masters_id, error } = await loadOwnedDefinition(req);
    if (error) return error;

    const { template_id } = req.body || {};
    if (!template_id) {
      return resError({ developer_msg: "template_id is required" });
    }

    const runResult = await runDefinitionByType(definition, req, res);
    if (runResult?.ack !== 1) return runResult;
    const rows = runResult?.data?.rows || [];

    const Template = documentPrintTemplateModel(req.tenantDB);
    const templateRow = await Template.findOne({ where: { id: template_id, company_masters_id, isDelete: 0 } });
    if (!templateRow) {
      return resError({ developer_msg: "Template not found" });
    }

    const { resolvedInputs, visibleTemplate } = await resolveReportInputsAndTemplate(
      req,
      definition,
      company_masters_id,
      rows,
      templateRow.draft_template_json,
    );

    const pdfBytes = await generate({ template: visibleTemplate, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
    const buffer = Buffer.from(pdfBytes);

    return resSuccess({ data: { item: { pdfBase64: buffer.toString("base64") } } });
  } catch (e) {
    console.error("previewReportPdf error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
