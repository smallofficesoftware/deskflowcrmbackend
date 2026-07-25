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
            colorColumns = null
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

        // Define columns
        sheet.columns = keys.map(key => ({
            header: headerMap[key] || key,
            key,
            width: 10
        }));

        // Add rows
        data.forEach(row => {
            const rowData = {};
            keys.forEach(k => (rowData[k] = getNested(row, k)));
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
