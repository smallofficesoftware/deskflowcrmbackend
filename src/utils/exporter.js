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

// Last-resort flattening for an untyped cell whose raw value isn't a
// scalar (a nested array/object the report's registry entry didn't
// derive a display string for). Without this, xlsx got "[object Object]"
// or a rich-value error and the PDF got "[object Object]". Dates stay
// Date objects for xlsx (real date cells) and are formatted for PDF.
const displayNameOf = (v) => (v && typeof v === "object" ? v.name ?? v.label ?? v.title ?? "" : v);
function toScalarCell(raw, { formatDates = false } = {}) {
    if (raw instanceof Date) {
        return formatDates ? moment(raw).format("DD/MM/YYYY - hh:mm A") : raw;
    }
    if (Array.isArray(raw)) {
        return raw.map(displayNameOf).filter((v) => v !== "" && v != null).join(", ");
    }
    if (raw && typeof raw === "object") return displayNameOf(raw);
    return raw;
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
            badgeColorKeys = null,

            // format: "nested-table" columns only (PDF) — { key: [{key,
            // label}] } describing the inner table's own columns. Ignored
            // entirely by the xlsx branch.
            columnSubColumns = null
        } = options || {};

        if (!Array.isArray(data)) {
            throw new Error("Data must be an array of objects.");
        }

        // xlsx has no "no data" placeholder row to fall back on, so it keeps
        // requiring a non-empty array; pdf renders its own "No data
        // available to export" row instead (see genericReportExport.ejs).
        if (data.length === 0 && fileFormat !== 'pdf') {
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
                columnSubColumns,
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
                    rowData[k] = toScalarCell(raw);
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

// format: "multiline" - a plain string containing literal "\n"s (e.g. a
// pre-joined "Name: X\nPhone: Y" block) that needs those breaks preserved
// in the rendered HTML, which collapses raw newlines otherwise.
function renderMultilineHtml(raw) {
    return escapeHtml(raw ?? "").replace(/\n/g, "<br/>");
}

// format: "nested-table" - the column's value is an array of row objects
// (e.g. one invoice's product line items) rendered as its own small HTML
// table inside the cell, per `subColumns` ({key,label}[], set on the
// column same as badge's colorKeys). Mirrors the old per-report jsPDF
// exports that drew a nested autoTable inside a cell for this exact case.
function renderNestedTableHtml(value, subColumns) {
    const items = Array.isArray(value) ? value : [];
    if (!Array.isArray(subColumns) || subColumns.length === 0 || items.length === 0) return "";

    const head = subColumns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
    const body = items
        .map(
            (item) =>
                `<tr>${subColumns.map((c) => `<td>${escapeHtml(getNested(item, c.key) ?? "-")}</td>`).join("")}</tr>`,
        )
        .join("");

    return `<table class="nested-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
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

// PDF column sizing. With an auto-layout 100%-wide table, one long-text
// column (remark, items, address) grabbed most of the page and squeezed
// the rest. Instead: size each column from its longest line of content,
// cap every column at a share of an A4-landscape printable width (so long
// text wraps rather than widening the column), and only let the table
// grow to the full page width when the columns actually need it - a
// 3-column report no longer stretches edge to edge (but keeps at least
// half the page so it doesn't shrink into a corner).
const PRINTABLE_WIDTH_MM = { A4: 277, A3: 400, A2: 574 }; // landscape, minus 2 x 10mm border
const A4_MAX_COLUMN_MM = 70; // ~25% of A4 landscape
const MIN_COLUMN_MM = 14;
const MIN_TABLE_SHARE = 0.5; // a few-column report still spans at least half the page
const MM_PER_CHAR = 1.45; // 9px Arial average glyph
const CELL_PADDING_MM = 4; // 6px left + right padding + border
const MAX_SAMPLE_ROWS = 300;

const plainTextOf = (value) =>
    String(value ?? "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&[a-z#0-9]+;/gi, "x");
const longestLine = (value) => plainTextOf(value).split("\n").reduce((max, line) => Math.max(max, line.trim().length), 0);

function computePdfColumnWidths(columns, rows, pageFormat) {
    const pageWidthMm = PRINTABLE_WIDTH_MM[pageFormat] || PRINTABLE_WIDTH_MM.A4;
    const sample = rows.slice(0, MAX_SAMPLE_ROWS);

    const naturalMm = columns.map((col) => {
        // Headers wrap on word boundaries, so only their longest word is a hard minimum.
        const headerWord = String(col.label || "").split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
        const contentChars = sample.reduce((m, row) => Math.max(m, longestLine(row[col.key])), 0);
        const mm = Math.max(headerWord, contentChars) * MM_PER_CHAR + CELL_PADDING_MM;
        return Math.min(Math.max(mm, MIN_COLUMN_MM), A4_MAX_COLUMN_MM);
    });

    const totalMm = naturalMm.reduce((a, b) => a + b, 0);
    const tableMm = Math.min(Math.max(totalMm, pageWidthMm * MIN_TABLE_SHARE), pageWidthMm);
    return {
        columnWidths: naturalMm.map((mm) => +((mm / totalMm) * 100).toFixed(2)),
        tableWidthPct: +((tableMm / pageWidthMm) * 100).toFixed(2),
    };
}

// Same-shaped counterpart to the xlsx branch above — renders `data` as an
// HTML table (genericReportExport.ejs) via the same pdf-creator-node
// pipeline every document-print template in this codebase already uses,
// then converts to PDF. Returns { outputPath, file_name } to match xlsx's
// return shape so callers (genericReportExportService.js) don't need to
// branch on format.
async function exportPdf(data, { keys, headerMap, fileName, outputPath, file_name, autoDownload, columnFormats, currencySymbol, badgeColorKeys, columnSubColumns }) {
    const HTML_FORMATS = ["badge", "multiline", "nested-table"];
    const columns = keys.map((key) => ({
        key,
        label: headerMap[key] || key,
        numeric: columnFormats?.[key] === "number" || columnFormats?.[key] === "currency",
        html: HTML_FORMATS.includes(columnFormats?.[key]),
    }));

    const rows = data.map((row) => {
        const formatted = { __isFooter: Boolean(row.__isFooter) };
        keys.forEach((key) => {
            const format = columnFormats?.[key];
            if (format === "badge") {
                formatted[key] = renderBadgeHtml(row, key, badgeColorKeys?.[key]);
                return;
            }
            if (format === "multiline") {
                formatted[key] = renderMultilineHtml(getNested(row, key));
                return;
            }
            if (format === "nested-table") {
                formatted[key] = renderNestedTableHtml(getNested(row, key), columnSubColumns?.[key]);
                return;
            }
            const raw = getNested(row, key);
            formatted[key] = format
                ? formatCellForDisplay(raw, format, currencySymbol)
                : (toScalarCell(raw, { formatDates: true }) ?? "");
        });
        return formatted;
    });

    // Old per-report jsPDF exports picked a4/a3/a2 by hand to fit however
    // many columns that report had; this mirrors that by column count so
    // wide reports (e.g. Attendance's one column per date) still get a
    // bigger page instead of every column being squeezed onto a fixed A4.
    const pageFormat = columns.length <= 10 ? "A4" : columns.length <= 16 ? "A3" : "A2";

    const { columnWidths, tableWidthPct } = computePdfColumnWidths(columns, rows, pageFormat);

    const templateHtml = fs.readFileSync(REPORT_PDF_TEMPLATE_PATH, "utf-8");
    const renderedHtml = ejs.render(templateHtml, {
        title: fileName,
        columns: columns.map((col, i) => ({ ...col, widthPct: columnWidths[i] })),
        rows,
        pageFormat,
        tableWidthPct,
    });

    const document = {
        html: renderedHtml,
        data: {},
        path: outputPath,
        type: autoDownload ? "buffer" : "",
    };

    const options = {
        format: pageFormat,
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
