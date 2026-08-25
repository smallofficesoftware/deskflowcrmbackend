import moment from "moment";
import XLSX from "xlsx";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { customFieldDatavaluesModel } from "../../models/other_settings/customfieldDatavaluesModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { productGroupModel } from "../../models/product_settings/productGroupModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { productTypesModel } from "../../models/product_settings/productTypesModel.js";
import { productUnitMasterModel } from "../../models/product_settings/productUnitMasterModel.js";
import { taxModel } from "../../models/product_settings/taxModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
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

export const addProductByExcelSheetV2 = async (req) => {
    try {
        if (!req.file) {
            return resBadRequest({
                ack_msg: "No file uploaded",
                developer_msg: "Please upload an Excel file",
            });
        }

        // Validate authentication details
        const { a_application_login_id } = req.body;

        if (!a_application_login_id) {
            return resBadRequest({
                ack_msg: "Missing authentication details",
                developer_msg: "a_application_login_id is required",
            });
        }

        // Validate company ID
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        if (!findCompanyId || !findCompanyId.company_masters_id) {
            return resBadRequest({
                ack_msg: "Invalid company ID",
                developer_msg: "Could not retrieve company ID for the provided login ID",
            });
        }

        const companyData = await companyModel.findOne({
            where: { id: findCompanyId.company_masters_id, isDelete: 0 },
            attributes: ["is_contact_validation"],
        });

        // Utility to convert string to title case
        const toTitleCase = (str) => {
            if (!str || typeof str !== "string") return "";
            return str
                .toLowerCase()
                .split(" ")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
        };

        const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];

        // if (sheetName !== "Export" || sheetName !== "Sheet1") {
        //     return resError({
        //         ack_msg: "Invalid sheet name",
        //         developer_msg: `Data must be in 'Sheet1'. Found: '${sheetName}'`,
        //     });
        // }

        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const definedColumnStatic = {
            "product_group": "product_group",
            "category_name": "category_name",
            "product_types": "product_types",
            "product_name": "product_name",
            "product_alias": "product_alias",
            "product_code": "product_code",
            "product_description": "product_description",
            "product_inner_qty": "product_inner_qty",
            "product_inner_unit": "product_inner_unit",
            "product_outer_qty": "product_outer_qty",
            "product_outer_unit": "product_outer_unit",
            "unit_name": "unit",
            "weight(gram)": "weight_or_size",
            "min_stock_quantity": "min_stock_quantity",
            "max_stock_quantity": "max_stock_quantity",
            "rate": "rate",
            "sales_gst_label": "gst_id",
            "purchase_rate": "purchase_rate",
            "purchase_gst_label": "purchase_gst_id",
            "hsn_code": "hsn_code",
        };

        const customFormFieldModelIntance = customFieldFormModel(req.tenantDB);
        const customFieldDatavaluesModelInstance = customFieldDatavaluesModel(req.tenantDB);

        let getCustomFormFieldR = await customFormFieldModelIntance.findAll({
            where: { form_type: 4, isDelete: 0 },
            attributes: ["title", "reference_column_name", "data_type", "id", "applicable_modules"],
            raw: true,
        });

        getCustomFormFieldR = Array.isArray(getCustomFormFieldR)
            ? getCustomFormFieldR.filter(f => !f.applicable_modules || String(f.applicable_modules).split(",").map(m => m.trim()).includes("4"))
            : [];

        const getCustomFormFieldObj = Array.isArray(getCustomFormFieldR)
            ? getCustomFormFieldR.reduce((acc, { reference_column_name, title }) => {
                acc[title] = reference_column_name;
                return acc;
            }, {})
            : {};

        const getCustomFormFieldRuleObj = Array.isArray(getCustomFormFieldR)
            ? getCustomFormFieldR.reduce((acc, { reference_column_name, title, data_type }) => {
                acc[reference_column_name] = data_type;
                return acc;
            }, {})
            : {};

        const getCustomFormFieldDataSourceValueObj = Array.isArray(getCustomFormFieldR)
            ? getCustomFormFieldR.reduce((acc, { reference_column_name, title, data_type, id }) => {
                if (data_type == 9 || data_type == 10) {
                    acc[id] = reference_column_name;
                }
                return acc;
            }, {})
            : {};

        const dataSourceIds = isValid(getCustomFormFieldDataSourceValueObj) ? Object.keys(getCustomFormFieldDataSourceValueObj) : [];

        const getCustomFormFieldDataSource = isValid(dataSourceIds) ? await customFieldDatavaluesModelInstance.findAll({
            where: { custom_field_master_id: dataSourceIds, isDelete: 0 },
            attributes: ["data_sorce", "data_type", "custom_field_master_id"],
            raw: true,
        }) : null;

        const getCustomFormFieldDataSourceObjValues = Array.isArray(getCustomFormFieldDataSource)
            ? getCustomFormFieldDataSource.reduce((acc, { data_sorce, custom_field_master_id }) => {

                const key = getCustomFormFieldDataSourceValueObj[custom_field_master_id];

                if (!key) return acc;

                if (!acc[key]) acc[key] = [];

                acc[key].push({
                    [data_sorce.toLowerCase()]: data_sorce
                });

                return acc;
            }, {})
            : {};



        const definedColumn = {
            ...definedColumnStatic,
            ...getCustomFormFieldObj
        }

        const mandetoryField = [
            "product_group",
            "category_name",
            "product_types",
            "product_name",
            "unit_name",
        ]

        const columns = data[0];
        const missingFields = mandetoryField.filter(f => !columns.includes(f));

        if (missingFields.length > 0) {
            return resError({
                ack_msg: `Missing mandatory fields:", ${missingFields}`,
                developer_msg: `Missing mandatory fields:", ${missingFields}`,
            });
        } else {
            const onlyData = data.slice(1);

            if (!isValid(onlyData)) {
                return resError({
                    ack_msg: `No Data found in current sheet.`,
                    developer_msg: `Excel Rows Data are not exist`,
                });
            }

            let filterdData = [];
            for (let i = 0; i < onlyData.length; i++) {
                let filtertedData = {};
                columns.map((v, j) => {
                    filtertedData[definedColumn[v]] = onlyData[i][j] || "";
                })
                filterdData.push(filtertedData)
            }

            const CTproductModel = productModel(req.tenantDB);
            const CTcategoryModel = categoryModel(req.tenantDB);
            const CTProductGroupModel = productGroupModel(req.tenantDB);
            const CTProductTypesModel = productTypesModel(req.tenantDB);
            const CTProductUnitMasterModel = productUnitMasterModel(req.tenantDB);
            const taxModelInstance = taxModel(req.tenantDB);
            const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);

            const [existingProducts, existingProductsGroup, existingCategories, productTypesMasterList, unitMasterList, taxMasterList] = await Promise.all([
                CTproductModel.findAll({
                    where: {
                        isDelete: 0,
                    },
                    raw: true,
                    attributes: ["product_name", "product_code", "category_id"]
                }),
                CTProductGroupModel.findAll({
                    where: {
                        isDelete: 0,
                    },
                    raw: true,
                    attributes: ["group_name", "id"]
                }),
                CTcategoryModel.findAll({
                    where: {
                        isDelete: 0,
                    },
                    raw: true,
                    attributes: ["category_name", "id"]
                }),
                CTProductTypesModel.findAll({
                    where: {
                        isDelete: 0,
                    },
                    raw: true,
                    attributes: ["name", "id"]
                }),
                CTProductUnitMasterModel.findAll({
                    where: {
                        isDelete: 0,
                    },
                    raw: true,
                    attributes: ["unit", "id"]
                }),
                taxModelInstance.findAll({
                    where: {
                        isDelete: 0,
                    },
                    raw: true,
                    attributes: ["name", "id", "value"]
                }),
            ]);


            const existingCodeSet = new Set(
                existingProducts
                    .filter(p => p.product_code)
                    .map(p => String(p.product_code).trim().toLowerCase())
            );

            const existingProductNameSet = new Map(
                existingProducts
                    .filter(p => p.product_name)
                    .map(p => [String(p.product_name).trim().toLowerCase(), p.category_id])
            );

            const productTypesMasterListSet = new Map(
                productTypesMasterList
                    .filter(p => p.name)
                    .map(p => [String(p.name).trim().toLowerCase(), p.id])
            );

            const unitMasterListSet = new Map(
                unitMasterList
                    .filter(p => p.unit)
                    .map(p => [String(p.unit).trim().toLowerCase(), p.id])
            );

            const existingCategorySet = new Map(
                existingCategories
                    .filter(p => p.category_name)
                    .map(p => [String(p.category_name).trim().toLowerCase(), p.id])
            );

            const existingProductsGroupSet = new Map(
                existingProductsGroup
                    .filter(p => p.group_name)
                    .map(p => [String(p.group_name).trim().toLowerCase(), p.id])
            );

            const taxMasterIdGroupSet = new Map(
                taxMasterList
                    .filter(p => p.name)
                    .map(p => [String(p.name).trim().toLowerCase(), p.id])
            );

            const taxMasterValueGroupSet = new Map(
                taxMasterList
                    .filter(p => p.name)
                    .map(p => [String(p.name).trim().toLowerCase(), p.value])
            );

            const getProductIdOrFalse = (code) => {
                return existingCategorySet.get(code) || false;
            };

            let productGrouupBlankRows = [];
            let categoryBlankRows = [];
            let productTypeBlankRows = [];
            let productNameBlankRows = [];
            let unitBlankRows = [];
            let rateBlankRows = [];
            let gstBlankRows = [];
            let productCodeDuplicateRows = [];
            let invalidCategoryNames = [];
            let invalidGstLabels = [];
            let invalidPurchaseGstLabels = [];
            let invalidProductGroupNames = [];
            let productAlredyExistInGivenCategoryNames = [];
            let productTypesInvalidNames = [];
            let invalidUnitName = [];
            let rateGstInvalidRows = [];
            const sanitizedData = [];

            for (let i = 0; i < filterdData.length; i++) {
                const v = filterdData[i];
                const rowNumber = i + 1;

                const product_group = isValid(v.product_group) ? v.product_group.toString().trim() : "";
                const category_name = isValid(v.category_name) ? v.category_name.toString().trim() : "";
                const product_types = isValid(v.product_types) ? v.product_types.toString().trim() : "";
                const product_name = isValid(v.product_name) ? v.product_name.toString().trim() : "";
                const unit = isValid(v.unit) ? v.unit.toString().trim() : "";
                const rate = isValid(v.rate) ? v.rate.toString().trim() : "";
                const gst_id = isValid(v.gst_id) ? v.gst_id.toString().trim() : "";
                const purchase_rate = isValid(v.purchase_rate) ? v.purchase_rate.toString().trim() : "";
                const purchase_gst_id = isValid(v.purchase_gst_id) ? v.purchase_gst_id.toString().trim() : "";
                const product_code = isValid(v.product_code) ? v.product_code.toString().trim() : "";

                const min_stock_quantity = isValid(v.min_stock_quantity) ? v.min_stock_quantity.toString().trim() : "";
                const max_stock_quantity = isValid(v.max_stock_quantity) ? v.max_stock_quantity.toString().trim() : "";

                const min_stock_quantity_int = isValid(min_stock_quantity) ? parseInt(min_stock_quantity, 10) || 0 : 0;
                const max_stock_quantity_int = isValid(max_stock_quantity) ? parseInt(max_stock_quantity, 10) || 0 : 0;

                const product_inner_qty_int = isValid(v.product_inner_qty) ? parseFloat(v.product_inner_qty, 10) || 1 : 1;
                const product_outer_qty_int = isValid(v.product_outer_qty) ? parseFloat(v.product_outer_qty, 10) || 1 : 1;

                let product_inner_unit = isValid(v.product_inner_unit) ? v.product_inner_unit.toString().trim() : "";
                let product_outer_unit = isValid(v.product_outer_unit) ? v.product_outer_unit.toString().trim() : "";
                let product_inner_unit_id;
                let product_outer_unit_id;

                // ================= VALIDATIONS =================

                if (!isValid(product_group)) {
                    productGrouupBlankRows.push(rowNumber);
                    continue;
                }

                if (!isValid(category_name)) {
                    categoryBlankRows.push(rowNumber);
                    continue;
                }

                if (!isValid(product_types)) {
                    productTypeBlankRows.push(rowNumber);
                    continue;
                }

                if (!isValid(product_name)) {
                    productNameBlankRows.push(rowNumber);
                    continue;
                }

                if (!isValid(unit)) {
                    unitBlankRows.push(rowNumber);
                    continue;
                }

                // if (!isValid(rate)) {
                //     rateBlankRows.push(rowNumber);
                //     continue;
                // }

                // if (!isValid(GST)) {
                //     gstBlankRows.push(rowNumber);
                //     continue;
                // }

                if (
                    isValid(product_code) &&
                    existingCodeSet.has(String(product_code).trim().toLowerCase())
                ) {
                    productCodeDuplicateRows.push(rowNumber);
                    continue;
                }

                // ================= PRODUCT GROUP (SAFE MAP UPDATE) =================
                const groupKey = String(product_group).trim().toLowerCase();
                let product_group_id = existingProductsGroupSet.get(groupKey);

                if (!product_group_id) {
                    const newCat = await CTProductGroupModel.create({
                        company_masters_id: findCompanyId.company_masters_id,
                        a_application_login_id,
                        group_name: product_group,
                        color: "#4C4C4C",
                        created_date_time: formattedDate,
                    });

                    product_group_id = newCat.id;

                    // Map updated safely
                    existingProductsGroupSet.set(groupKey, product_group_id);
                }

                if (!isValid(product_group_id)) {
                    invalidProductGroupNames.push(rowNumber);
                    continue;
                }

                // ================= CATEGORY (SAFE MAP UPDATE) =================

                const categoryKey = String(category_name).trim().toLowerCase();
                let category_id = existingCategorySet.get(categoryKey);

                if (!category_id) {
                    const newCat = await CTcategoryModel.create({
                        company_masters_id: findCompanyId.company_masters_id,
                        a_application_login_id,
                        group_id: product_group_id,
                        category_name,
                        color: "#4C4C4C",
                        created_date_time: formattedDate,
                    });

                    category_id = newCat.id;

                    // Map updated safely
                    existingCategorySet.set(categoryKey, category_id);
                }

                if (!isValid(category_id)) {
                    invalidCategoryNames.push(rowNumber);
                    continue;
                }

                // ================= GST (SAFE MAP UPDATE) =================

                let gst_id_a = null;
                let GST = 0;

                if (isValid(gst_id)) {
                    const gstKey = String(gst_id).trim().toLowerCase();

                    gst_id_a = taxMasterIdGroupSet.get(gstKey);
                    if (!isValid(gst_id_a)) {
                        invalidGstLabels.push(rowNumber);
                        continue;
                    }

                    GST = taxMasterValueGroupSet.get(gstKey) || 0;
                }

                let purchase_gst_id_a = null;
                let purchase_gst_per = 0;

                if (isValid(purchase_gst_id)) {
                    const purchaseGstKey = String(purchase_gst_id).trim().toLowerCase();

                    purchase_gst_id_a = taxMasterIdGroupSet.get(purchaseGstKey);
                    if (!isValid(purchase_gst_id_a)) {
                        invalidPurchaseGstLabels.push(rowNumber);
                        continue;
                    }

                    purchase_gst_per = taxMasterValueGroupSet.get(purchaseGstKey) || 0;
                }


                // ================= PRODUCT NAME DUPLICATE =================

                if (
                    existingProductNameSet.get(String(product_name).trim().toLowerCase()) === category_id
                ) {
                    productAlredyExistInGivenCategoryNames.push(rowNumber);
                    continue;
                }

                // ================= PRODUCT TYPE =================

                const product_type_id = productTypesMasterListSet.get(
                    String(product_types).trim().toLowerCase()
                );

                if (!isValid(product_type_id)) {
                    productTypesInvalidNames.push(rowNumber);
                    continue;
                }

                // ================= UNIT =================

                const unit_id = unitMasterListSet.get(String(unit).trim().toLowerCase()) || 0;

                if (!isValid(unit_id)) {
                    invalidUnitName.push(rowNumber);
                    continue;
                }

                product_inner_unit_id = isValid(product_inner_unit) ? unitMasterListSet.get(String(product_inner_unit).trim().toLowerCase()) || unit_id : unit_id;
                product_outer_unit_id = isValid(product_outer_unit) ? unitMasterListSet.get(String(product_outer_unit).trim().toLowerCase()) || unit_id : unit_id;


                // ================= RATE & GST =================

                const rateFloat = parseFloat(rate) || 0;
                const GSTFloat = parseFloat(GST) || 0;

                // if (
                //     isNaN(rateFloat) ||
                //     isNaN(GSTFloat)
                // ) {
                //     rateGstInvalidRows.push(rowNumber);
                //     continue;
                // }

                const netRate = rateFloat + (rateFloat * GSTFloat) / 100;
                const product_barcode_number = Date.now() + i;

                const purchase_rateFloat = parseFloat(purchase_rate) || 0;
                const purchase_gst_perFloat = parseFloat(purchase_gst_per) || 0;
                const purchase_net_rate = purchase_rateFloat + (purchase_rateFloat * purchase_gst_perFloat) / 100;




                // ================= FINAL OBJECT =================

                const objCreated = {
                    ...v,
                    product_group_id,
                    category_id,
                    product_types: product_type_id,
                    rate: isValid(rateFloat) ? rateFloat : 0,
                    GST: isValid(GSTFloat) ? GSTFloat : 0,
                    gst_id: isValid(gst_id_a) ? gst_id_a : 0,
                    net_rate: isValid(netRate) ? netRate : 0,
                    product_barcode_number,
                    min_stock_quantity: min_stock_quantity_int,
                    max_stock_quantity: max_stock_quantity_int,
                    purchase_rate: purchase_rateFloat,
                    purchase_gst_per: purchase_gst_perFloat,
                    purchase_gst_id: purchase_gst_id_a ? purchase_gst_id_a : 0,
                    purchase_net_rate: purchase_net_rate,
                    unit_id,
                    product_inner_unit: product_inner_unit_id,
                    product_outer_unit: product_outer_unit_id,
                    product_inner_qty: product_inner_qty_int,
                    product_outer_qty: product_outer_qty_int,
                };

                const sanitizedRow = processRowDynamic(
                    objCreated,
                    getCustomFormFieldRuleObj,
                    formattedDate,
                    getCustomFormFieldDataSourceObjValues
                );

                sanitizedData.push(sanitizedRow);
            }


            // Mapping arrays to messages
            const messageMap = [
                { rows: productGrouupBlankRows, text: "Product group is blank." },
                { rows: categoryBlankRows, text: "Category is blank." },
                { rows: productTypeBlankRows, text: "Product type is blank." },
                { rows: productNameBlankRows, text: "Product name is blank." },
                { rows: unitBlankRows, text: "Unit is blank." },
                { rows: rateBlankRows, text: "Rate is blank." },
                { rows: gstBlankRows, text: "GST is blank." },
                { rows: productCodeDuplicateRows, text: "Product code is duplicate." },
                { rows: invalidCategoryNames, text: "Invalid category." },
                { rows: invalidGstLabels, text: "Invalid GST label." },
                { rows: invalidPurchaseGstLabels, text: "Invalid purchase GST label." },
                { rows: invalidProductGroupNames, text: "Invalid product group." },
                { rows: productAlredyExistInGivenCategoryNames, text: "Product already exists in category." },
                { rows: productTypesInvalidNames, text: "Invalid product type." },
                { rows: invalidUnitName, text: "Invalid unit." },
                { rows: rateGstInvalidRows, text: "Invalid rate or GST." },
            ];

            // Build message
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

            if (!isValid(sanitizedData)) {
                return resError({
                    ack_msg: "No valid data found.",
                    developer_msg: "All rows were skipped due to validation errors.",
                    data: responseMessage || "",
                });
            }

            const processedProducts = sanitizedData.map((product) => {
                const {
                    product_types,
                    category_id,
                    product_name,
                    product_alias,
                    product_code,
                    product_description,
                    product_inner_qty,
                    product_inner_unit,
                    product_outer_qty,
                    product_outer_unit,
                    unit_id,
                    weight_or_size,
                    min_stock_quantity,
                    max_stock_quantity,
                    rate,
                    GST,
                    gst_id,
                    purchase_rate,
                    purchase_gst_per,
                    purchase_gst_id,
                    hsn_code,
                    ...customFields
                } = product;

                return {
                    company_masters_id: findCompanyId.company_masters_id,
                    a_application_login_id,
                    product_group_id: product.product_group_id,
                    category_id,
                    product_types,
                    product_name,
                    product_alias,
                    product_code,
                    product_description,
                    product_inner_qty,
                    product_inner_unit,
                    product_outer_qty,
                    product_outer_unit,
                    unit: unit_id,
                    weight_or_size,
                    min_stock_quantity,
                    max_stock_quantity,
                    rate,
                    GST,
                    gst_id,
                    purchase_rate,
                    purchase_gst_per,
                    purchase_gst_id,
                    hsn_code,
                    created_date_time: formattedDate,
                    ...customFields,
                };
            });

            const productInsertData = processedProducts.map(
                (product, index) => {
                    const product_barcode_number = Date.now() + index;

                    return {
                        ...product,
                        product_barcode_number,
                    };
                }
            );

            const userList = await CTproductModel.findAll({
                where: {
                    company_masters_id: findCompanyId.company_masters_id,
                    a_application_login_id,
                    isDelete: 0,
                },
                attributes: ["id"],
            });

            const userRightsList = await applicationLoginTypeRightModelIntance.findAll({
                where: {
                    company_masters_id: findCompanyId.company_masters_id,
                    page_id: PAGE_ID.PRODUCT,
                    isDelete: 0,
                },
                attributes: ["a_application_login_id", "a_page_id_rights_jason"],
            });

            for (const right of userRightsList) {
                try {
                    let json = right.a_page_id_rights_jason;
                    if (typeof json === "string") {
                        json = JSON.parse(json);
                        if (typeof json === "string") {
                            json = JSON.parse(json);
                        }
                    }
                    if (typeof json?.limit === "number" && json.limit > 0) {
                        if (userList.length + processedProducts.length > json.limit) {
                            return resError({
                                ack_msg: "Your Product Limit Exceeded",
                                developer_msg: `Limit ${json.limit} would be exceeded`,
                            });
                        }
                    }
                } catch (e) {
                    console.error("JSON parse error for rights:", e);
                }
            }

            // Bulk create product
            const insertProduct = await CTproductModel.bulkCreate(
                productInsertData,
                {
                    validate: true,
                    returning: true,
                }
            );

            if (isValid(insertProduct)) {
                return resSuccess({
                    code: 200,
                    ack: 1,
                    ack_msg: `Successfully imported`,
                    developer_msg: `Successfully imported`,
                    data: responseMessage || "",
                });
            }
        }
    } catch (error) {
        console.log("addContactByExcelSheetV2 Error", error)
        return resError({
            ack_msg: "Unexpected error occurred during excel import.",
            developer_msg: error.message,
        });
    }
}

export const addProductByExcelSheetUpdateData = async (req) => {
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

        // order_qty_unit: 1=Quantity only, 2=+Inner, 3=+Outer, 4=+Inner+Outer
        // -- same gate as the sample-sheet generator (productServices.js),
        // so a company that doesn't use inner/outer packaging can't write
        // to a field its own UI never lets it set in the first place.
        const companyOrderQtySetting = await companyModel.findOne({
            where: { id: findCompanyId.company_masters_id, isDelete: 0 },
            attributes: ["order_qty_unit"],
        });
        const innerOuterQtyActive = Number(companyOrderQtySetting?.order_qty_unit) > 1;

        const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

        // ================= READ EXCEL =================

        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

        const sheetName = workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];

        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!isValid(data) || data.length <= 1) {
            return resError({
                ack_msg: "No Data found in current sheet.",
                developer_msg: "Excel Rows Data are not exist",
            });
        }

        // ================= STATIC COLUMNS =================

        const definedColumnStatic = {
            "product_id": "id",
            "product_group": "product_group",
            "Product Group": "product_group",
            "product_category": "category_name",
            "Product Category": "category_name",
            "category_name": "category_name",
            "product_name": "product_name",
            "product_alias": "product_alias",
            "Product Code": "product_code",
            "product_description": "product_description",
            "weight_or_size": "weight_or_size",
            "hsn_code": "hsn_code",
            "min_stock_quantity": "min_stock_quantity",
            "max_stock_quantity": "max_stock_quantity",
            "rate": "rate",
            "sales_gst_label": "gst_id",
            "purchase_rate": "purchase_rate",
            "purchase_gst_label": "purchase_gst_id",
            ...(innerOuterQtyActive && {
                "product_inner_qty": "product_inner_qty",
                "product_outer_qty": "product_outer_qty",
            }),
        };

        // ================= CUSTOM FIELD =================

        const customFormFieldModelIntance = customFieldFormModel(req.tenantDB);

        const customFieldDatavaluesModelInstance =
            customFieldDatavaluesModel(req.tenantDB);

        let getCustomFormFieldR =
            await customFormFieldModelIntance.findAll({
                where: {
                    form_type: 4,
                    isDelete: 0
                },
                attributes: [
                    "title",
                    "reference_column_name",
                    "data_type",
                    "id",
                    "applicable_modules"
                ],
                raw: true,
            });

        getCustomFormFieldR = Array.isArray(getCustomFormFieldR)
            ? getCustomFormFieldR.filter(f => !f.applicable_modules || String(f.applicable_modules).split(",").map(m => m.trim()).includes("4"))
            : [];

        const getCustomFormFieldObj =
            Array.isArray(getCustomFormFieldR)
                ? getCustomFormFieldR.reduce(
                    (acc, { reference_column_name, title }) => {

                        acc[title] = reference_column_name;

                        return acc;

                    }, {}
                )
                : {};

        const getCustomFormFieldRuleObj =
            Array.isArray(getCustomFormFieldR)
                ? getCustomFormFieldR.reduce(
                    (acc, { reference_column_name, data_type }) => {

                        acc[reference_column_name] = data_type;

                        return acc;

                    }, {}
                )
                : {};

        const getCustomFormFieldDataSourceValueObj =
            Array.isArray(getCustomFormFieldR)
                ? getCustomFormFieldR.reduce(
                    (acc, { reference_column_name, data_type, id }) => {

                        if (data_type == 9 || data_type == 10) {
                            acc[id] = reference_column_name;
                        }

                        return acc;

                    }, {}
                )
                : {};

        const dataSourceIds =
            isValid(getCustomFormFieldDataSourceValueObj)
                ? Object.keys(getCustomFormFieldDataSourceValueObj)
                : [];

        const getCustomFormFieldDataSource =
            isValid(dataSourceIds)
                ? await customFieldDatavaluesModelInstance.findAll({
                    where: {
                        custom_field_master_id: dataSourceIds,
                        isDelete: 0
                    },
                    attributes: [
                        "data_sorce",
                        "custom_field_master_id"
                    ],
                    raw: true,
                })
                : null;

        const getCustomFormFieldDataSourceObjValues =
            Array.isArray(getCustomFormFieldDataSource)
                ? getCustomFormFieldDataSource.reduce(
                    (acc, { data_sorce, custom_field_master_id }) => {

                        const key =
                            getCustomFormFieldDataSourceValueObj[
                            custom_field_master_id
                            ];

                        if (!key) return acc;

                        if (!acc[key]) acc[key] = [];

                        acc[key].push({
                            [data_sorce.toLowerCase()]: data_sorce,
                        });

                        return acc;

                    }, {}
                )
                : {};

        // ================= MERGE COLUMNS =================

        const definedColumn = {
            ...definedColumnStatic,
            ...getCustomFormFieldObj,
        };

        // ================= REQUIRED FIELDS =================

        const mandetoryField = [
            "product_id",
            "product_name",
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

        // ================= PRODUCT MODEL =================

        const CTproductModel = productModel(req.tenantDB);
        const taxModelInstance = taxModel(req.tenantDB);
        const CTcategoryModel = categoryModel(req.tenantDB);
        const CTProductGroupModel = productGroupModel(req.tenantDB);

        const [existingCategories, existingProductGroups, existingProducts, taxMasterList] = await Promise.all([
            CTcategoryModel.findAll({
                where: {
                    company_masters_id: findCompanyId.company_masters_id,
                    isDelete: 0,
                },
                attributes: ["id", "category_name", "group_id"],
                raw: true,
            }),
            CTProductGroupModel.findAll({
                where: {
                    company_masters_id: findCompanyId.company_masters_id,
                    isDelete: 0,
                },
                attributes: ["id", "group_name"],
                raw: true,
            }),
            CTproductModel.findAll({
                where: {
                    company_masters_id:
                        findCompanyId.company_masters_id,
                    isDelete: 0,
                },
                attributes: ["id"],
                raw: true,
            }),
            taxModelInstance.findAll({
                where: {
                    isDelete: 0,
                },
                raw: true,
                attributes: ["name", "id", "value"]
            }),
        ]);

        const existingProductsGroupSet = new Map(
            existingProductGroups.map((g) => [
                String(g.group_name).trim().toLowerCase(),
                g.id,
            ])
        );

        const taxMasterIdGroupSet = new Map(
            taxMasterList.map(p => [
                String(p.name).toLowerCase(),
                p.id
            ])
        );

        const taxMasterValueGroupSet = new Map(
            taxMasterList.map(p => [
                String(p.name).toLowerCase(),
                p.value
            ])
        );

        const existingProductIds = new Set(
            existingProducts.map((p) => Number(p.id))
        );

        // ================= VALIDATION ARRAYS =================

        let productIdBlankRows = [];
        let productNotFoundRows = [];
        let productNameBlankRows = [];
        let gstBlankRows = [];
        let purchaseGstBlankRows = [];
        let negativeValueRows = [];
        let invalidProductGroupRows = [];
        let invalidCategoryRows = [];
        let categoryGroupMismatchRows = [];

        const sanitizedData = [];

        // ================= LOOP =================
        for (let i = 0; i < filterdData.length; i++) {

            const v = filterdData[i];

            const rowNumber = i + 2;

            const id = isValid(v.id)
                ? Number(v.id)
                : 0;

            const product_name = isValid(v.product_name)
                ? v.product_name.toString().trim()
                : "";

            const rate = parseFloat(v.rate) || 0;

            const gst_id = isValid(v.gst_id) ? String(v.gst_id).trim() : "";

            const purchase_rate =
                parseFloat(v.purchase_rate) || 0;

            const purchase_gst_id =
                isValid(v.purchase_gst_id) ? String(v.purchase_gst_id).trim() : "";

            const min_stock_quantity =
                parseInt(v.min_stock_quantity) || 0;

            const max_stock_quantity =
                parseInt(v.max_stock_quantity) || 0;

            const product_inner_qty = innerOuterQtyActive
                ? (parseFloat(v.product_inner_qty) || 0)
                : undefined;

            const product_outer_qty = innerOuterQtyActive
                ? (parseFloat(v.product_outer_qty) || 0)
                : undefined;

            const product_group = isValid(v.product_group)
                ? v.product_group.toString().trim()
                : "";

            const category_name = isValid(v.category_name)
                ? v.category_name.toString().trim()
                : "";

            let product_group_id = undefined;
            if (isValid(product_group)) {
                const groupKey = String(product_group).trim().toLowerCase();
                product_group_id = existingProductsGroupSet.get(groupKey);

                if (!product_group_id) {
                    invalidProductGroupRows.push(rowNumber);
                    continue;
                }
            }

            let category_id = undefined;
            if (isValid(category_name)) {
                const categoryKey = String(category_name).trim().toLowerCase();
                const matchedCategories = existingCategories.filter(
                    (c) => String(c.category_name).trim().toLowerCase() === categoryKey
                );

                if (matchedCategories.length === 0) {
                    invalidCategoryRows.push(rowNumber);
                    continue;
                }

                if (product_group_id !== undefined) {
                    const matchForGroup = matchedCategories.find(
                        (c) => Number(c.group_id) === Number(product_group_id)
                    );
                    if (!matchForGroup) {
                        categoryGroupMismatchRows.push(rowNumber);
                        continue;
                    }
                    category_id = matchForGroup.id;
                } else {
                    category_id = matchedCategories[0].id;
                }
            }

            // ================= VALIDATIONS =================

            if (!isValid(id)) {
                productIdBlankRows.push(rowNumber);
                continue;
            }

            if (!existingProductIds.has(id)) {
                productNotFoundRows.push(rowNumber);
                continue;
            }

            if (!isValid(product_name)) {
                productNameBlankRows.push(rowNumber);
                continue;
            }

            let GST = 0;
            let gst_id_a = "";
            if (isValid(gst_id)) {
                const gstKey = taxMasterIdGroupSet.get(String(gst_id).toLowerCase());
                if (!isValid(gstKey)) {
                    gstBlankRows.push(rowNumber);
                    continue;
                }
                gst_id_a = gstKey;
                GST = taxMasterValueGroupSet.get(String(gst_id).toLowerCase()) || 0;
            }

            let purchase_gst_per = 0;
            let purchase_gst_id_a = "";
            if (isValid(purchase_gst_id)) {
                const gstKey = taxMasterIdGroupSet.get(String(purchase_gst_id).toLowerCase());
                if (!isValid(gstKey)) {
                    purchaseGstBlankRows.push(rowNumber);
                    continue;
                }
                purchase_gst_id_a = gstKey;
                purchase_gst_per = taxMasterValueGroupSet.get(String(purchase_gst_id).toLowerCase()) || 0;
            }

            // ================= NEGATIVE VALIDATION =================

            if (
                rate < 0 ||
                GST < 0 ||
                purchase_rate < 0 ||
                purchase_gst_per < 0
            ) {
                negativeValueRows.push(rowNumber);
                continue;
            }

            // ================= NET RATE =================

            const net_rate =
                rate + ((rate * GST) / 100);

            const purchase_net_rate =
                purchase_rate +
                ((purchase_rate * purchase_gst_per) / 100);

            // ================= FINAL OBJECT =================

            const objCreated = {
                ...v,

                id,

                rate,
                GST,

                purchase_rate,
                purchase_gst_per,
                gst_id: gst_id_a,
                purchase_gst_id: purchase_gst_id_a,

                // ADD THESE
                net_rate,
                purchase_net_rate,

                min_stock_quantity,
                max_stock_quantity,

                ...(product_inner_qty !== undefined && { product_inner_qty }),
                ...(product_outer_qty !== undefined && { product_outer_qty }),
                ...(product_group_id !== undefined && { product_group_id }),
                ...(category_id !== undefined && { category_id }),
            };
            delete objCreated.product_group;
            delete objCreated.category_name;
            delete objCreated.product_category;

            const sanitizedRow = processRowDynamic(
                objCreated,
                getCustomFormFieldRuleObj,
                formattedDate,
                getCustomFormFieldDataSourceObjValues
            );

            sanitizedData.push(sanitizedRow);
        }

        // ================= RESPONSE MESSAGE =================

        const messageMap = [
            {
                rows: productIdBlankRows,
                text: "Product ID is blank."
            },
            {
                rows: productNotFoundRows,
                text: "Product ID not found."
            },
            {
                rows: productNameBlankRows,
                text: "Product name is blank."
            },
            {
                rows: gstBlankRows,
                text: "Invalid Sales GST Label."
            },
            {
                rows: purchaseGstBlankRows,
                text: "Invalid Purchase GST Label."
            },
            {
                rows: negativeValueRows,
                text: "Negative values are not allowed."
            },
            {
                rows: invalidProductGroupRows,
                text: "Product Group not found."
            },
            {
                rows: invalidCategoryRows,
                text: "Product Category not found."
            },
            {
                rows: categoryGroupMismatchRows,
                text: "Product Category does not belong to the given Product Group."
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

        // ================= UPDATE PRODUCTS =================

        let updatedCount = 0;

        for (const product of sanitizedData) {

            const { id, ...updateData } = product;

            const updated = await CTproductModel.update(
                {
                    ...updateData,
                    updated_date_time: formattedDate,
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
            ack_msg: `Successfully updated ${updatedCount} products.`,
            developer_msg: `Successfully updated ${updatedCount} products.`,
            data: responseMessage || "",
        });

    } catch (error) {

        console.log(
            "addProductByExcelSheetV2 Error",
            error
        );

        return resError({
            ack_msg:
                "Unexpected error occurred during excel import.",
            developer_msg: error.message,
        });
    }
};