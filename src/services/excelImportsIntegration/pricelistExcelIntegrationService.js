import moment from "moment";
import XLSX from "xlsx";
import { priceListModel } from "../../models/product_settings/priceListModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import {
    isValid,
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

// Convert Excel serial number to JS Date
// function excelSerialToJsDate(serial) {
//     const totalSeconds = Math.round(serial * 24 * 60 * 60);
//     const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
//     const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
//     const ss = String(totalSeconds % 60).padStart(2, "0");
//     return `${hh}:${mm}:${ss}`;
// }

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30); // 1899-12-30 UTC

function parseExcelToJsDate(value) {
    // Already a JS Date
    if (value instanceof Date) return value;

    // Strings - try common formats, fall back to Date parser
    if (typeof value === "string") {
        // try common datetime / date / time formats with moment (strict)
        let m = moment(value, [
            "YYYY-MM-DD HH:mm:ss",
            "YYYY-MM-DD HH:mm",
            "YYYY/MM/DD HH:mm:ss",
            "YYYY/MM/DD HH:mm",
            "DD-MM-YYYY HH:mm:ss",
            "DD-MM-YYYY HH:mm",
            "YYYY-MM-DD",
            "YYYY/MM/DD",
            "DD-MM-YYYY",
            "HH:mm:ss",
            "H:mm",
            "HH:mm"
        ], true);

        if (m.isValid()) {
            // If it was time-only, attach today's date
            const onlyTime = /^(?:\d{1,2}:\d{2}(?::\d{2})?)$/.test(value.trim());
            if (onlyTime) {
                const today = moment();
                return today
                    .hour(m.hour())
                    .minute(m.minute())
                    .second(m.second())
                    .millisecond(0)
                    .toDate();
            }
            return m.toDate();
        }

        // fallback
        const parsed = new Date(value);
        if (!isNaN(parsed)) return parsed;
        return null;
    }

    // Number: Excel serial (date / time / datetime)
    if (typeof value === "number" && !isNaN(value)) {
        // time-only (fraction) -> attach to today's date (local)
        if (Math.abs(value) < 1) {
            const totalSeconds = Math.round(value * 86400);
            const hh = Math.floor(totalSeconds / 3600);
            const mm = Math.floor((totalSeconds % 3600) / 60);
            const ss = totalSeconds % 60;

            const today = new Date();
            today.setHours(hh, mm, ss, 0); // local time today at that hh:mm:ss
            return today;
        }

        // date or date+time
        const days = Math.floor(value);
        const fraction = value - days;
        const msFromDays = days * 86400000;

        // Build UTC date for the day portion
        const dateUtc = new Date(EXCEL_EPOCH_UTC + msFromDays);
        const Y = dateUtc.getUTCFullYear();
        const M = dateUtc.getUTCMonth();
        const D = dateUtc.getUTCDate();

        // time-of-day from fraction
        const totalSeconds = Math.round(fraction * 86400);
        const hh = Math.floor(totalSeconds / 3600);
        const mm = Math.floor((totalSeconds % 3600) / 60);
        const ss = totalSeconds % 60;

        // create a local Date with those components (so it represents the expected wall-clock date+time)
        return new Date(Y, M, D, hh, mm, ss, 0);
    }

    return null; // unknown / unsupported type
}

// MAIN UNIVERSAL CONVERTER (All 8 rules)
function convertByRule(value, ruleType, fallback = null, dataSourceValue = null) {

    // ------------------ TEXT RULES -----------------------
    if (ruleType === 2 || ruleType === 3) {
        return value ? String(value).trim() : "";
    }

    // ------------------ NUMBER RULE -----------------------
    if (ruleType === 1) {
        const n = Number(value);
        return isNaN(n) ? fallback : n;
    }

    // ------------------ DECIMAL RULE -----------------------
    if (ruleType === 8) {
        const n = parseFloat(value);
        return isNaN(n) ? fallback : n;
    }

    // ------------------ SWITCH RULE -----------------------
    if (ruleType === 7) {
        if (value === undefined || value === null) return 0;

        const val = String(value).toLowerCase();
        return ["1", "true", "yes"].includes(val) ? '1' : '2';
    }

    // ------------------ RADIO / DROPDOWN RULE -----------------------
    if (ruleType === 10 || ruleType === 9) {
        const val = isValid(dataSourceValue) ? dataSourceValue?.[String(value).toLowerCase()] : null;
        if (val === undefined || val === null) return "";
        // const val = String(value).toLowerCase();
        return val;
    }

    // ------------------ DATE / TIME RULES -----------------
    let dateObj = null;

    // Excel serial number
    if (typeof value === "number" && !isNaN(value)) {
        dateObj = parseExcelToJsDate(value);
    }

    // Try parsing string dates
    if (!dateObj && typeof value === "string") {
        dateObj = parseExcelToJsDate(value)
    }

    if (!dateObj) return fallback;

    switch (ruleType) {
        case 4: // DATE
            return moment(dateObj).format("YYYY-MM-DD");

        case 5: // DATETIME
            return moment(dateObj).format("YYYY-MM-DD HH:mm:ss");

        case 6: // TIME
            return moment(dateObj).format("HH:mm:ss");

        default:
            return value;
    }
}

// -------------------------------------------------------------
// PROCESS COMPLETE ROW USING DYNAMIC COLUMN RULES FROM DATABASE
// -------------------------------------------------------------
function processRowDynamic(row, columnRules, fallbackDateTime, dataSourceValue) {
    const newRow = {};

    for (const colName in row) {
        const ruleType = columnRules?.[colName]; // coming dynamically from DB

        if (ruleType) {
            const dataSourceListObj = dataSourceValue[colName] ?? null;
            const dataSourceListObjList = dataSourceListObj ? Object.assign({}, ...dataSourceListObj) : null
            newRow[colName] = convertByRule(row[colName], ruleType, fallbackDateTime, dataSourceListObjList);
        } else {
            newRow[colName] = row[colName]; // no rule → keep original
        }
    }

    return newRow;
}


export const addPriceListByExcelSheetUpdateData = async (req) => {
    try {

        if (!req.file) {
            return resBadRequest({
                ack_msg: "No file uploaded",
                developer_msg: "Please upload an Excel file",
            });
        }

        const { a_application_login_id } = req.body;

        if (!a_application_login_id) {
            return resBadRequest({
                ack_msg: "Missing authentication details",
                developer_msg: "a_application_login_id is required",
            });
        }

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        if (!findCompanyId || !findCompanyId.company_masters_id) {
            return resBadRequest({
                ack_msg: "Invalid company ID",
                developer_msg: "Could not retrieve company ID for the provided login ID",
            });
        }

        const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

        // ================= READ EXCEL =================

        const workbook = XLSX.read(req.file.buffer, {
            type: "buffer",
        });

        const sheetName = workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];

        const data = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
        });

        if (!isValid(data) || data.length <= 1) {
            return resError({
                ack_msg: "No Data found in current sheet.",
                developer_msg: "Excel Rows Data are not exist",
            });
        }

        // ================= COLUMNS =================

        const definedColumn = {
            "pricelist_id": "id",
            "product_id": "product_id",
            "product_name": "product_name",
            "rate": "rate",
            "discount(%)": "discount",
            "discount Flat": "discount_amount",
        };

        // ================= REQUIRED FIELDS =================

        const mandetoryField = [
            "pricelist_id",
            "product_id",
            "rate",
        ];

        const columns = data[0];

        const missingFields = mandetoryField.filter(
            (f) => !columns.includes(f)
        );

        if (missingFields.length > 0) {
            return resError({
                ack_msg: `Missing mandatory fields : ${missingFields}`,
                developer_msg: `Missing mandatory fields : ${missingFields}`,
            });
        }

        // ================= FILTER DATA =================

        const onlyData = data.slice(1);

        let filterdData = [];

        for (let i = 0; i < onlyData.length; i++) {

            let filtertedData = {};

            columns.map((v, j) => {

                filtertedData[definedColumn[v]] =
                    onlyData[i][j] || "";

            });

            filterdData.push(filtertedData);
        }

        // ================= MODELS =================

        const priceListModelIntance =
            priceListModel(req.tenantDB);

        const productModelIntance =
            productModel(req.tenantDB);

        // ================= GET PRICE LIST =================

        const existingPriceList =
            await priceListModelIntance.findAll({
                where: {
                    company_masters_id:
                        findCompanyId.company_masters_id,
                    isDelete: 0,
                },
                attributes: [
                    "id",
                    "product_id",
                ],
                raw: true,
            });

        const priceListMap = new Map(
            existingPriceList.map((p) => [
                Number(p.id),
                p,
            ])
        );

        // ================= GET PRODUCTS =================

        const productList =
            await productModelIntance.findAll({
                where: {
                    company_masters_id:
                        findCompanyId.company_masters_id,
                    isDelete: 0,
                },
                attributes: [
                    "id",
                    "GST",
                ],
                raw: true,
            });

        const productMap = new Map(
            productList.map((p) => [
                Number(p.id),
                p,
            ])
        );

        // ================= VALIDATION ARRAYS =================

        let priceListIdBlankRows = [];

        let priceListNotFoundRows = [];

        let negativeValueRows = [];

        let invalidDiscountRows = [];

        const sanitizedData = [];

        // ================= LOOP =================

        for (let i = 0; i < filterdData.length; i++) {

            const v = filterdData[i];

            const rowNumber = i + 2;

            const id = isValid(v.id)
                ? Number(v.id)
                : 0;

            const rate =
                parseFloat(v.rate) || 0;

            let discount =
                parseFloat(v.discount) || 0;

            let discount_amount =
                parseFloat(v.discount_amount) || 0;

            // ================= VALIDATIONS =================

            if (!isValid(id)) {
                priceListIdBlankRows.push(rowNumber);
                continue;
            }
            const product_id = isValid(v.product_id)
                ? Number(v.product_id)
                : 0;

            const priceListData =
                existingPriceList.find(
                    (p) =>
                        Number(p.id) === id &&
                        Number(p.product_id) === product_id
                );

            if (!priceListData) {
                priceListNotFoundRows.push(rowNumber);
                continue;
            }

            // ================= NEGATIVE VALIDATION =================

            if (
                rate < 0 ||
                discount < 0 ||
                discount_amount < 0
            ) {
                negativeValueRows.push(rowNumber);
                continue;
            }

            // ================= DISCOUNT VALIDATION =================

            if (
                discount > rate ||
                discount_amount > rate
            ) {
                invalidDiscountRows.push(rowNumber);
                continue;
            }

            // ================= PRODUCT GST =================

            const productData =
                productMap.get(
                    Number(priceListData.product_id)
                );

            const GST =
                parseFloat(productData?.GST) || 0;

            // ================= CALCULATION =================

            let finalAmount = rate;

            // FLAT DISCOUNT PRIORITY
            if (discount_amount > 0) {

                finalAmount =
                    rate - discount_amount;

                // calculate percentage also
                discount =
                    ((discount_amount * 100) / rate);

            } else {

                // percentage discount
                const percentageAmount =
                    (rate * discount) / 100;

                finalAmount =
                    rate - percentageAmount;

                // store flat amount also
                discount_amount =
                    percentageAmount;
            }

            // ================= GST ADD =================

            const gstAmount =
                (finalAmount * GST) / 100;

            const net_rate =
                finalAmount + gstAmount;

            // ================= FINAL OBJECT =================

            sanitizedData.push({
                id,
                rate,
                discount,
                discount_amount,
                net_rate,
                updated_date_time: formattedDate,
            });
        }

        // ================= RESPONSE MESSAGE =================

        const messageMap = [
            {
                rows: priceListIdBlankRows,
                text: "Pricelist ID is blank."
            },
            {
                rows: priceListNotFoundRows,
                text: "Pricelist ID not found."
            },
            {
                rows: negativeValueRows,
                text: "Negative values are not allowed."
            },
            {
                rows: invalidDiscountRows,
                text: "Discount cannot be greater than rate."
            },
        ];

        let responseMessage = messageMap
            .map((item) =>
                item.rows
                    .map(
                        (row) =>
                            `Row Number <b>${row}</b> : ${item.text}<br/>`
                    )
                    .join("")
            )
            .join("");

        // ================= NO VALID DATA =================

        if (!isValid(sanitizedData)) {
            return resError({
                ack_msg: "No valid data found.",
                developer_msg: "All rows skipped.",
                data: responseMessage || "",
            });
        }

        // ================= UPDATE PRICE LIST =================

        let updatedCount = 0;

        for (const price of sanitizedData) {

            const {
                id,
                product_id,
                ...updateData
            } = price;

            const updated =
                await priceListModelIntance.update(
                    {
                        ...updateData,
                    },
                    {
                        where: {
                            id,
                            company_masters_id:
                                findCompanyId.company_masters_id,
                            isDelete: 0,
                        },
                    }
                );

            if (updated[0] > 0) {
                updatedCount++;
            }
        }

        // ================= SUCCESS =================

        return resSuccess({
            code: 200,
            ack: 1,
            ack_msg: `Successfully updated ${updatedCount} price list records.`,
            developer_msg: `Successfully updated ${updatedCount} price list records.`,
            data: responseMessage || "",
        });

    } catch (error) {

        console.log(
            "addPriceListByExcelSheetUpdateData Error",
            error
        );

        return resError({
            ack_msg:
                "Unexpected error occurred during excel import.",
            developer_msg: error.message,
        });
    }
};