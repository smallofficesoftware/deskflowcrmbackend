import ExcelJS from "exceljs";
import moment from "moment";
import path from "path";

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
            currencySymbol = ""
        } = options || {};

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("Data must be a non-empty array of objects.");
        }

        if (!['xlsx'].includes(fileFormat)) {
            throw new Error('Invalid format. Only "xlsx" supported.');
        }

        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const file_name = `${fileName}_${timestamp}.${fileFormat}`;
        const outputPath = path.join(outputDir, file_name);

        const sample = data[0];
        const keys = Array.isArray(columns) && columns.length > 0 ? columns : Object.keys(sample);
        const headerMap = headers || Object.fromEntries(keys.map(k => [k, k]));

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
