import fs from "fs";
import path from "path";
import companyModel from "../../../models/company_setup/companyModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { EXPORTS_LINK_EXTENDED } from "../../../utils/appConstants.js";
import { exportData } from "../../../utils/exporter.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";
import { reportExportRegistry } from "./reportExportRegistry.js";

// One lookup per export, not per cell — resolves the company's own
// currency_id (companyModel, master DB) to its symbol (currencyModel,
// master DB, same relation modelRegistry.js's carts.currency already
// uses). Falls back to "" (no symbol prefix) rather than failing the
// whole export if the company has no currency set.
const resolveCurrencySymbol = async (company_masters_id) => {
  try {
    const company = await companyModel.findOne({ where: { id: company_masters_id, isDelete: 0 }, attributes: ["currency_id"] });
    if (!company?.currency_id) return "";
    const currency = await currencyModel.findOne({ where: { id: company.currency_id, isDelete: 0 }, attributes: ["symbol"] });
    return currency?.symbol || "";
  } catch {
    return "";
  }
};

const PAGE_LIMIT = 1000;

function ensureUploadDir(subPath) {
  const uploadDir = path.resolve(process.cwd(), subPath);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

// Every per-report service already supports offset/limit (ul/ll) pagination
// for its on-screen paginated view, but none has a "return everything" mode
// - the frontend used to loop this itself for export. Same loop, moved here
// so it can feed one shared xlsx generator instead of 46 client-side ones.
//
// `extractRows` must stay a per-page, 1:1-ish transform (its output length
// drives the "more pages?" check below) - a report that needs to GROUP rows
// (e.g. summing cart items into one row per product/category) has to do
// that grouping once over the *complete* accumulated set via an optional
// `postProcess(allRows)`, not per-page inside extractRows. Grouping per
// page would silently split one product/category's totals across however
// many pages its cart items happened to fall into.
const fetchAllRows = async (registryEntry, req) => {
  const rows = [];
  let offset = 0;

  while (true) {
    const page = { ...req, body: { ...req.body, ul: offset, ll: PAGE_LIMIT } };
    const result = await registryEntry.fetchPage(page);
    const pageRows = registryEntry.extractRows(result, page);

    rows.push(...pageRows);

    if (pageRows.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return registryEntry.postProcess ? registryEntry.postProcess(rows) : rows;
};

const getNested = (obj, keyPath) => {
  if (!keyPath) return undefined;
  return keyPath
    .split(".")
    .reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
};

const toNumber = (value) => {
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]+/g, ""));
  return isNaN(n) ? 0 : n;
};

// Generic totals-row support: `footer.sums` names one or more numeric
// aggregates over the exported row set (optionally restricted to rows
// matching a groupBy field/value, e.g. Account Outstanding's payable vs
// receivable split); `footer.rows` then templates one or more literal
// output rows referencing those sums by outputKey via {fromSum}. Keeps
// the "what totals a report shows" business logic on the frontend (each
// report already knows its own shape) while doing the actual summation
// here, over whichever row set (DB-fetched or client-supplied) is being
// exported.
const computeFooterRows = (rows, footer) => {
  if (!footer) return [];

  const sumValues = {};
  for (const sum of footer.sums || []) {
    const filtered = sum.groupBy
      ? rows.filter((r) => String(getNested(r, sum.groupBy.field)) === sum.groupBy.equals)
      : rows;
    sumValues[sum.outputKey] = filtered.reduce(
      (acc, r) => acc + toNumber(getNested(r, sum.sourceKey)),
      0,
    );
  }

  return (footer.rows || []).map((template) => {
    const row = {};
    for (const [key, value] of Object.entries(template)) {
      row[key] =
        value && typeof value === "object" && "fromSum" in value
          ? sumValues[value.fromSum]?.toFixed(2)
          : value;
    }
    return row;
  });
};

export const exportReportExcel = async (req) => {
  try {
    const { reportType, filters = {}, columns = [], footer, rows: providedRows } = req.body;

    if (!Array.isArray(columns) || columns.length === 0) {
      return resError({ ack_msg: "columns is required" });
    }

    const findCompanyId = await getCompanyByLoginId(filters.a_application_login_id);

    // A grid-selection export already has its exact rows in hand
    // client-side - skip re-querying the DB and just export those.
    let rows;
    if (Array.isArray(providedRows) && providedRows.length > 0) {
      rows = providedRows;
    } else {
      const registryEntry = reportExportRegistry[reportType];
      if (!registryEntry) {
        return resError({ ack_msg: `Unknown reportType "${reportType}"` });
      }
      const pageReq = { ...req, body: { ...filters } };
      rows = await fetchAllRows(registryEntry, pageReq);
    }

    if (!rows.length) {
      return resError({ ack_msg: "No data to export" });
    }

    const allRows = [...rows, ...computeFooterRows(rows, footer)];

    const keys = columns.map((c) => c.key);
    const headers = Object.fromEntries(columns.map((c) => [c.key, c.label]));
    // "date"/"number"/"currency" columns get a real typed cell + numFmt in
    // exporter.js; a column with no `format` (every existing caller, and
    // any string/lookup column here) keeps today's exact stringified
    // behavior. Only resolve the company's currency symbol when at least
    // one column actually needs it - one extra query, not on every export.
    const columnFormats = Object.fromEntries(columns.filter((c) => c.format).map((c) => [c.key, c.format]));
    const currencySymbol = Object.values(columnFormats).includes("currency")
      ? await resolveCurrencySymbol(findCompanyId.company_masters_id)
      : "";

    const uploadDir = ensureUploadDir(
      `media-folder/exports/reports/${findCompanyId.company_masters_id}`,
    );
    const savedFile = await exportData(allRows, {
      format: "xlsx",
      fileName: reportType,
      columns: keys,
      headers,
      autoDownload: false,
      outputDir: uploadDir,
      columnFormats: Object.keys(columnFormats).length > 0 ? columnFormats : undefined,
      currencySymbol,
    });
    if (!savedFile) {
      return resError({ developer_msg: "Failed to generate Excel export" });
    }

    const fileUrl = `${EXPORTS_LINK_EXTENDED}reports/${findCompanyId.company_masters_id}/${savedFile.file_name}`;
    return resSuccess({ data: { fileUrl, fileName: savedFile.file_name } });
  } catch (error) {
    console.error("exportReportExcel error:", error);
    return resError({ developer_msg: `Failed to export report: ${error}` });
  }
};
