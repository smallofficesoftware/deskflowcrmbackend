import ejs from "ejs";
import ExcelJS from "exceljs";
import fs from "fs";
import moment from "moment";
import path from "path";
import pdf from "pdf-creator-node";
import { fileURLToPath } from "url";

const __dirnameConstant = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PDF_TEMPLATE_PATH = path.join(__dirnameConstant, "../views/reports/genericReportExport.ejs");

function getNested(obj, key) {
    if (!key) return undefined;
    return key.split('.').reduce(
        (acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined),
        obj
    );
}

export async function exportData(data, options = {}) {
    try {
        const {
            columns,
            headers,
            format: fileFormat = "xlsx",
            fileName = "data_export",
            outputDir,
            autoDownload = false,
            streamTo,

            //  NEW FEATURE: Dynamic color map
            // Example: colorColumns: { email_id: "FFFF0000", mobile_number: "FF00FF00" }
            colorColumns = null,

            // Per-column cell typing — { key: "date" | "number" | "currency" }.
            // A column with no entry here keeps today's exact behavior
            // (stringified value, no numFmt) — every existing caller that
            // never passes this is untouched. currencySymbol is resolved
            // once by the caller (one company lookup per export, not per
            // cell) and only matters for a "currency"-formatted column.
            columnFormats = null,
            currencySymbol = "",

            // format: "badge" columns only (PDF) — { key: [candidate row
            // field names holding that column's pill color, checked in
            // order] }. Ignored entirely by the xlsx branch.
            badgeColorKeys = null
        } = options || {};

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("Data must be a non-empty array of objects.");
        }

        if (!['xlsx', 'pdf'].includes(fileFormat)) {
            throw new Error('Invalid format. Only "xlsx" or "pdf" supported.');
        }

        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const file_name = `${fileName}_${timestamp}.${fileFormat}`;
        const outputPath = path.join(outputDir, file_name);

        const sample = data[0];
        const keys = Array.isArray(columns) && columns.length > 0 ? columns : Object.keys(sample);
        const headerMap = headers || Object.fromEntries(keys.map(k => [k, k]));

        if (fileFormat === 'pdf') {
            return await exportPdf(data, {
                keys,
                headerMap,
                fileName,
                outputPath,
                file_name,
                autoDownload,
                columnFormats,
                currencySymbol,
                badgeColorKeys,
            });
        }

        // Create workbook
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Export");

        // numFmt per format kind — date/number/currency only; a column with
        // no entry in columnFormats gets no numFmt (today's behavior).
        const numFmtFor = (format) => {
            if (format === "date") return "dd-mm-yyyy";
            if (format === "number") return "#,##0.##";
            if (format === "currency") return `"${currencySymbol}"#,##0.00`;
            return undefined;
        };

        // Define columns
        sheet.columns = keys.map(key => ({
            header: headerMap[key] || key,
            key,
            width: 10,
            style: columnFormats?.[key] ? { numFmt: numFmtFor(columnFormats[key]) } : undefined
        }));

        // Add rows — a "date"/"number"/"currency" column gets a real typed
        // cell (Date object / Number) so the numFmt above actually renders
        // as a date/number in Excel instead of a left-aligned string;
        // anything unparseable falls back to the raw value rather than
        // silently blanking the cell.
        data.forEach(row => {
            const rowData = {};
            keys.forEach(k => {
                const raw = getNested(row, k);
                const format = columnFormats?.[k];
                if (format === "date" && raw) {
                    const parsed = moment(raw);
                    rowData[k] = parsed.isValid() ? parsed.toDate() : raw;
                } else if ((format === "number" || format === "currency") && raw !== null && raw !== undefined && raw !== "") {
                    const num = Number(raw);
                    rowData[k] = isNaN(num) ? raw : num;
                } else {
                    rowData[k] = raw;
                }
            });
            sheet.addRow(rowData);
        });

        // Auto-width
        sheet.columns.forEach(column => {
            let maxLength = String(column.header || "").length;
            column.eachCell({ includeEmpty: true }, (cell) => {
                if (cell.value) {
                    const len = String(cell.value).length;
                    if (len > maxLength) maxLength = len;
                }
            });
            column.width = Math.min(Math.max(maxLength + 2, 10), 50);
        });

        // Style headers
        const headerRow = sheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
            const key = sheet.columns[colNumber - 1].key;

            // Base style
            cell.font = { bold: true };
            cell.alignment = { vertical: "middle", horizontal: "center" };
            // cell.fill = {
            //     type: "pattern",
            //     pattern: "solid",
            //     fgColor: { argb: "FFEEEEEE" }
            // };

            // Apply dynamic color (if provided)
            if (colorColumns && colorColumns[key]) {
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: colorColumns[key] }
                };
            }
        });

        // Return file
        if (autoDownload) {
            return await workbook.xlsx.writeBuffer();
        }

        await workbook.xlsx.writeFile(outputPath);
        return { outputPath, file_name };
    } catch (error) {
        console.log("exportData error", error)
    }
}

// Mirrors the xlsx branch's date/number/currency handling above, but
// produces a display string (there's no cell-level numFmt in an HTML
// table) instead of a typed cell value.
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Mirrors the on-screen grid's own badge styling exactly (white text,
// rounded pill, "#eeeeee" default) rather than the old per-report jsPDF
// exports' brightness-based auto-contrast text color — one less thing to
// keep in sync with the grid, and what users already see on screen.
function renderBadgeHtml(row, key, colorKeys) {
    const color = (colorKeys || []).map((k) => getNested(row, k)).find(Boolean) || "#eeeeee";
    const label = escapeHtml(getNested(row, key) ?? "-");
    return `<span style="background-color:${color};color:#fff;padding:2px 8px;border-radius:12px;display:inline-block;">${label}</span>`;
}

function formatCellForDisplay(raw, format, currencySymbol) {
    if (raw === null || raw === undefined || raw === "") return "";
    if (format === "date") {
        const parsed = moment(raw);
        return parsed.isValid() ? parsed.format("DD-MM-YYYY") : String(raw);
    }
    if (format === "number" || format === "currency") {
        const num = Number(raw);
        if (isNaN(num)) return String(raw);
        const formatted = num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return format === "currency" ? `${currencySymbol}${formatted}` : formatted;
    }
    return String(raw);
}

// Same-shaped counterpart to the xlsx branch above — renders `data` as an
// HTML table (genericReportExport.ejs) via the same pdf-creator-node
// pipeline every document-print template in this codebase already uses,
// then converts to PDF. Returns { outputPath, file_name } to match xlsx's
// return shape so callers (genericReportExportService.js) don't need to
// branch on format.
async function exportPdf(data, { keys, headerMap, fileName, outputPath, file_name, autoDownload, columnFormats, currencySymbol, badgeColorKeys }) {
    const columns = keys.map((key) => ({
        key,
        label: headerMap[key] || key,
        numeric: columnFormats?.[key] === "number" || columnFormats?.[key] === "currency",
        html: columnFormats?.[key] === "badge",
    }));

    const rows = data.map((row) => {
        const formatted = { __isFooter: Boolean(row.__isFooter) };
        keys.forEach((key) => {
            const format = columnFormats?.[key];
            if (format === "badge") {
                formatted[key] = renderBadgeHtml(row, key, badgeColorKeys?.[key]);
                return;
            }
            const raw = getNested(row, key);
            formatted[key] = format
                ? formatCellForDisplay(raw, format, currencySymbol)
                : (raw ?? "");
        });
        return formatted;
    });

    const templateHtml = fs.readFileSync(REPORT_PDF_TEMPLATE_PATH, "utf-8");
    const renderedHtml = ejs.render(templateHtml, { title: fileName, columns, rows });

    const document = {
        html: renderedHtml,
        data: {},
        path: outputPath,
        type: autoDownload ? "buffer" : "",
    };

    const options = {
        format: "A4",
        orientation: "landscape",
        border: "10mm",
        footer: {
            height: "5mm",
            contents: {
                default: `<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>`,
            },
        },
    };

    const result = await pdf.create(document, options);

    if (autoDownload) {
        return result;
    }

    return { outputPath, file_name };
}
