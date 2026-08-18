
import moment from "moment";
import { Op } from "sequelize";
import XLSX from "xlsx";
import { generateTimeBasedPrefixedUUID } from "../../helpers/uuidHelper.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { areaModel } from "../../models/masters/areaModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { countryModel } from "../../models/masters/countryModel.js";
import { labelModel } from "../../models/masters/labelModel.js";
import { sourceTypesModel } from "../../models/masters/sourceTypeMode.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { customFieldDatavaluesModel } from "../../models/other_settings/customfieldDatavaluesModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { priceListMastersModel } from "../../models/product_settings/priceListMastersModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import {
    isValid,
    normalizeToTenDigit,
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { autoAssignmentContactIdsGet, prepareMailAndWhatsappSenderToTheContact } from "../other_settings/wrkflwAutoAssignmentContactService.js";



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

export const addContactByExcelSheet = async (req) => {
    return
    // Check if file is uploaded
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

    const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

    // Utility to convert string to title case
    const toTitleCase = (str) => {
        if (!str || typeof str !== "string") return "";
        return str
            .toLowerCase()
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    try {
        // Read Excel file
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];

        if (sheetName !== "Sheet1") {
            return resError({
                ack_msg: "Invalid sheet name",
                developer_msg: `Data must be in 'Sheet1'. Found: '${sheetName}'`,
            });
        }

        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Define expected columns
        const expectedColumns = [
            "person_name",
            "company_name",
            "Email",
            "mobile_number",
            "client_code",
            "Country",
            "State",
            "City",
            "Area",
            "Pincode",
            "Address",
            "shipping_address",
            "gst_number",
            "price_list",
            "source_type",
            "category_name",
            "product_name",
            "required_quantity",
            "requirement_type",
            "Description",
            "datetime",
        ];

        const columnNames = data[0];
        const isValidColumns = expectedColumns.every((col, index) => {
            return columnNames[index] && columnNames[index].trim() === col;
        });

        // Validate column names
        if (!isValidColumns) {
            return resError({
                ack_msg: "Invalid column names or order",
                developer_msg: `Expected columns: ${expectedColumns.join(
                    ", "
                )}. Found: ${columnNames.join(", ")}`,
            });
        }

        // Check for duplicate mobile numbers
        const mobileNumbers = new Set();
        const clientCodeSet = new Set();
        const mobileColumnIndex = expectedColumns.indexOf("mobile_number"); // Find index of mobile_number column
        const clientCodeColumnIndex = expectedColumns.indexOf("client_code");
        const duplicateMobiles = [];
        const duplicateClientCode = [];

        for (let i = 1; i < data.length; i++) {
            const mobile = normalizeToTenDigit(data[i][mobileColumnIndex]?.toString().trim());
            const clientCode = data[i][clientCodeColumnIndex]?.toString().trim();
            if (companyData?.is_contact_validation === 2 && mobile) {
                if (mobileNumbers.has(mobile)) {
                    duplicateMobiles.push({ row: i + 1, mobile_number: mobile });
                    continue;
                } else {
                    mobileNumbers.add(mobile);
                }
            }
            if (clientCode) {
                if (clientCodeSet.has(clientCode)) {
                    duplicateClientCode.push({ row: i + 1, client_code: clientCode });
                    continue;
                } else {
                    clientCodeSet.add(clientCode);
                }
            }
        }

        if (duplicateMobiles.length > 0) {
            return resError({
                ack_msg: "Duplicate mobile numbers found",
                developer_msg: `Duplicate mobile numbers detected in rows: ${duplicateMobiles
                    .map((d) => `Row ${d.row}: ${d.mobile_number}`)
                    .join(", ")}`,
            });
        }
        if (duplicateClientCode.length > 0) {
            return resError({
                ack_msg: "Duplicate Client Code found",
                developer_msg: `Duplicate Client Code detected in rows: ${duplicateClientCode
                    .map((d) => `Row ${d.row}: ${d.client_code}`)
                    .join(", ")}`,
            });
        }


        const actualData = data.slice(1);
        if (actualData.length === 0) {
            return resError({
                ack_msg: "Empty Excel sheet",
                developer_msg: "No data rows found in Sheet1",
            });
        }

        // Initialize models
        const CTsourceTypesModel = sourceTypesModel(req.tenantDB);
        const CTcountryModel = countryModel(req.tenantDB);
        const CTstateModel = stateModel(req.tenantDB);
        const CTcityModel = cityModel(req.tenantDB);
        const CTareaModel = areaModel(req.tenantDB);
        const CTproductModel = productModel(req.tenantDB);
        const CTpriceListMastersModel = priceListMastersModel(req.tenantDB);
        const CTcategoryModel = categoryModel(req.tenantDB);
        const CTinquiryModel = inquiryModel(req.tenantDB);
        const CTcontactModel = contactModel(req.tenantDB);
        const CTcontactMessageHistory = contactMessageHistory(req.tenantDB);

        // Fetch source types
        const sourceTypes = await CTsourceTypesModel.findAll({
            where: {
                isDelete: 0,
                [Op.or]: [
                    { a_application_login_id: a_application_login_id },
                    { company_masters_id: findCompanyId.company_masters_id },
                    { id: -1 },
                    { id: -2 },
                ],
            },
            attributes: ["id", "source_name"],
        });
        const sourceTypeMap = new Map(
            sourceTypes.map((sourceType) => [
                sourceType.source_name.toLowerCase(),
                sourceType.id,
            ])
        );

        // Fetch location data
        const countries = await CTcountryModel.findAll();
        const states = await CTstateModel.findAll();
        const cities = await CTcityModel.findAll();
        const areas = await CTareaModel.findAll();

        const countryMap = new Map(
            countries.map((country) => [country.country_name, country.id])
        );
        const stateMap = new Map(
            states.map((state) => [state.state_name, state.id])
        );
        const cityMap = new Map(cities.map((city) => [city.city_name, city.id]));
        const areaMap = new Map(areas.map((area) => [area.area_name, area.id]));

        // Fetch existing products
        const existingProducts = await CTproductModel.findAll({
            where: {
                isDelete: 0,
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
            },
        });
        const existingProductMap = new Map(
            existingProducts.map((entry) => [`${entry.product_name}`, entry.id])
        );

        // Fetch existing price lists
        const existingPriceLists = await CTpriceListMastersModel.findAll({
            where: {
                isDelete: 0,
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
            },
        });
        const existingPriceListMap = new Map(
            existingPriceLists.map((entry) => [`${entry.price_list_name}`, entry.id])
        );

        // Fetch existing categories
        const existingCategories = await CTcategoryModel.findAll({
            where: {
                isDelete: 0,
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
            },
        });
        const existingCategoryMap = new Map(
            existingCategories.map((entry) => [
                entry.category_name?.trim().toLowerCase(),
                entry.id,
            ])
        );

        let processedContacts = [];
        let inquiryMatches = [];
        let messageMatches = [];
        let invalidEntries = [];
        let duplicateEntries = [];

        // Process each row
        for (let i = 0; i < actualData.length; i++) {
            const entry = actualData[i];
            const rowNumber = i + 2;

            // Validate required fields
            const personName = entry[0]
                ? toTitleCase(entry[0].toString().trim())
                : "";
            const mobileNumber = entry[3] !== undefined && entry[3] !== null ? normalizeToTenDigit(entry[3].toString().trim()) : "";
            const clientCode = entry[4] !== undefined && entry[4] !== null ? entry[4].toString().trim() : "";

            if (!personName) {
                invalidEntries.push(`Row ${rowNumber}: Person name is required`);
                continue;
            }

            if (!mobileNumber) {
                invalidEntries.push(`Row ${rowNumber}: Mobile number is required`);
                continue;
            }

            // Validate mobile number format
            if (!/^\d+$/.test(mobileNumber)) {
                invalidEntries.push(
                    `Row ${rowNumber}: Mobile number must contain only digits`
                );
                continue;
            }

            if (mobileNumber.length < 10 || mobileNumber.length > 15) {
                invalidEntries.push(
                    `Row ${rowNumber}: Mobile number must be between 10 and 15 digits`
                );
                continue;
            }

            try {
                const gstNumber = entry[12] && typeof entry[12] === "string" ? entry[12].trim() : "";

                // Check for duplicates
                const existingContact = await CTcontactModel.findOne({
                    where: {
                        isDelete: 0,
                        mobile_number: mobileNumber,
                    },
                });

                if (existingContact) {
                    duplicateEntries.push(
                        `Row ${rowNumber}: Duplicate data found for mobile number: ${mobileNumber}`
                    );
                    continue;
                }

                // Check for duplicates
                if (clientCode) {
                    const existingClientCode = await CTcontactModel.findOne({
                        where: {
                            isDelete: 0,
                            client_code: clientCode,
                        },
                    });

                    if (existingClientCode) {
                        duplicateEntries.push(
                            `Row ${rowNumber}: Duplicate data found for Client Code: ${mobileNumber}`
                        );
                        continue;
                    }
                }

                const existingContactGst = gstNumber
                    ? await CTcontactModel.findOne({
                        where: {
                            isDelete: 0,
                            gst_number: gstNumber,
                            [Op.or]: [
                                { a_application_login_id },
                                { company_masters_id: findCompanyId.company_masters_id },
                            ],
                        },
                    })
                    : null;

                if (existingContactGst) {
                    duplicateEntries.push(
                        `Row ${rowNumber}: Duplicate data found for GST number: ${gstNumber}`
                    );
                    continue;
                }
                // Handle location fields
                let countryId = 0,
                    stateId = 0,
                    cityId = 0,
                    areaId = 0;
                const countryName = entry[5]
                    ? toTitleCase(entry[5].toString().trim())
                    : "";
                if (countryName) {
                    const country = await CTcountryModel.findOne({
                        where: { country_name: countryName },
                    });
                    if (country) {
                        countryId = country.id;
                        const stateName = entry[6] ? toTitleCase(entry[6].toString().trim()) : "";
                        if (stateName) {
                            const state = await CTstateModel.findOne({
                                where: { state_name: stateName, country_id: country.id }
                            });
                            if (state) {
                                stateId = state.id;
                                const cityName = entry[7]
                                    ? toTitleCase(entry[7].toString().trim())
                                    : "";
                                if (cityName) {
                                    const city = await CTcityModel.findOne({
                                        where: { city_name: cityName, state_id: state.id },
                                    });
                                    if (city) {
                                        cityId = city.id;
                                        const areaName = entry[8]
                                            ? toTitleCase(entry[8].toString().trim())
                                            : "";
                                        if (areaName) {
                                            const area = await CTareaModel.findOne({
                                                where: { area_name: areaName, city_id: city.id },
                                            });
                                            areaId = area ? area.id : 0;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // --- Cascading fallback logic ---
                // Fallback 1: state name given but country could not be matched → try resolving
                //             state independently and derive country from it
                if (!countryId && !stateId && entry[6]) {
                    const stateName = toTitleCase(entry[6].toString().trim());
                    const state = await CTstateModel.findOne({ where: { state_name: stateName } });
                    if (state) {
                        stateId   = state.id;
                        countryId = state.country_id || 0;
                    }
                } else if (stateId && !countryId) {
                    // State was found (inside country block above) but country_id still 0 — derive
                    const state = await CTstateModel.findOne({ where: { id: stateId }, attributes: ['country_id'] });
                    countryId = state?.country_id || 0;
                }

                // Fallback 2: city name given but state/country missing → resolve city independently
                if (!cityId && entry[7]) {
                    const cityName = toTitleCase(entry[7].toString().trim());
                    const city = await CTcityModel.findOne({ where: { city_name: cityName } });
                    if (city) {
                        cityId = city.id;
                        if (!stateId)   stateId   = city.state_id   || 0;
                        if (!countryId) countryId = city.country_id || 0;
                    }
                } else if (cityId && (!stateId || !countryId)) {
                    const city = await CTcityModel.findOne({ where: { id: cityId }, attributes: ['state_id', 'country_id'] });
                    if (!stateId)   stateId   = city?.state_id   || 0;
                    if (!countryId) countryId = city?.country_id || 0;
                }

                // Fallback 3: area name given but city/state/country missing → resolve area independently
                if (!areaId && entry[8]) {
                    const areaName = toTitleCase(entry[8].toString().trim());
                    const area = await CTareaModel.findOne({ where: { area_name: areaName } });
                    if (area) {
                        areaId = area.id;
                        if (!cityId)    cityId    = area.city_id    || 0;
                        if (!stateId)   stateId   = area.state_id   || 0;
                        if (!countryId) countryId = area.country_id || 0;
                    }
                } else if (areaId && (!cityId || !stateId || !countryId)) {
                    const area = await CTareaModel.findOne({ where: { id: areaId }, attributes: ['city_id', 'state_id', 'country_id'] });
                    if (!cityId)    cityId    = area?.city_id    || 0;
                    if (!stateId)   stateId   = area?.state_id   || 0;
                    if (!countryId) countryId = area?.country_id || 0;
                }
                // --- End fallback ---

                // Handle category creation
                let categoryId = -1;
                const rawCategoryName = entry[15] ? entry[15].toString().trim() : "";
                if (rawCategoryName) {
                    const normalizedCategoryName = toTitleCase(rawCategoryName);
                    const categoryMatch = existingCategories.find(
                        (cat) =>
                            cat.category_name?.trim().toLowerCase() ===
                            normalizedCategoryName.toLowerCase()
                    );

                    if (categoryMatch) {
                        categoryId = categoryMatch.id;
                    } else {
                        const createdCategory = await CTcategoryModel.create({
                            company_masters_id: findCompanyId.company_masters_id,
                            a_application_login_id,
                            category_name: normalizedCategoryName,
                            created_date_time: formattedDate,
                        });
                        categoryId = createdCategory.id;
                        existingCategories.push({
                            id: categoryId,
                            category_name: normalizedCategoryName,
                        });
                        existingCategoryMap.set(
                            normalizedCategoryName.toLowerCase(),
                            categoryId
                        );
                    }
                }

                // Handle other mappings
                const normalizedProductKey = entry[16]
                    ? toTitleCase(entry[16].toString().trim())
                    : "";
                const productId = existingProductMap.get(normalizedProductKey) || -1;

                const normalizedPriceListKey = entry[13]
                    ? toTitleCase(entry[13].toString().trim())
                    : "";
                const priceListId =
                    existingPriceListMap.get(normalizedPriceListKey) || 0;

                const normalizedSourceTypeKey = entry[14]
                    ? entry[14].toString().trim().toLowerCase()
                    : "";
                const sourceTypeId = sourceTypeMap.get(normalizedSourceTypeKey) || 0;

                // Process DateTime
                let dateTime = null;
                const dateTimeCell = entry[20];
                if (typeof dateTimeCell === "number") {
                    const jsDate = moment(
                        XLSX.SSF.format("yyyy-mm-dd hh:mm:ss", dateTimeCell)
                    ).toDate();
                    dateTime = moment(jsDate).format("YYYY-MM-DD HH:mm:ss");
                } else if (
                    dateTimeCell &&
                    typeof dateTimeCell === "string" &&
                    dateTimeCell.trim()
                ) {
                    dateTime = moment(dateTimeCell).isValid()
                        ? moment(dateTimeCell).format("YYYY-MM-DD HH:mm:ss")
                        : formattedDate;
                }
                /* Contact Assignement */
                const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
                    source_type_id: sourceTypeId,
                    country_id: countryId,
                    state_id: stateId,
                    city_id: cityId,
                    area_id: areaId,
                });
                const contactAssignedIdsStr = isValid(contactAssignedIds?.data) ? contactAssignedIds?.data?.join(",") : '';
                /* Contact Assignement */

                // Build contact object
                processedContacts.push({
                    created_date_time: dateTime || formattedDate,
                    person_name: personName,
                    client_code: clientCode || "",
                    mobile_number: mobileNumber,
                    email_id: entry[2] ? entry[2].toString().trim() : "",
                    pincode: entry[9] ? entry[9].toString().trim() : "",
                    address: entry[10] ? entry[10].toString().trim() : "",
                    a_application_login_id,
                    company_masters_id: findCompanyId.company_masters_id,
                    source_type_id: sourceTypeId,
                    country: countryId,
                    state: stateId,
                    city: cityId,
                    area: areaId,
                    shipping_address: entry[11] ? entry[11].toString().trim() : "",
                    gst_number: gstNumber,
                    assinged_to_price_list: priceListId,
                    company_name: entry[1] ? entry[1].toString().trim() : "",
                    assinged_to_work_a_application_id: contactAssignedIdsStr
                });

                // Process inquiries and messages if description exists
                const description = entry[19] ? entry[19].toString().trim() : "";
                if (description) {
                    const existingInquiry = await CTinquiryModel.findOne({
                        where: {
                            product_id: productId,
                            category_id: categoryId,
                            description,
                            source_type_id: sourceTypeId,
                            qty: entry[17] ? String(entry[17]) : "",
                            [Op.or]: [
                                { a_application_login_id },
                                { company_masters_id: findCompanyId.company_masters_id },
                            ],
                            isDelete: 0,
                        },
                    });

                    if (existingInquiry) {
                        duplicateEntries.push(
                            `Row ${rowNumber}: Duplicate inquiry found: ${description}`
                        );
                        continue;
                    }

                    inquiryMatches.push({
                        contact_master_id: null, // Will be updated after contact creation
                        product_id: productId,
                        category_id: categoryId,
                        description,
                        inquiry_date_time: dateTime || formattedDate,
                        a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        source_type_id: sourceTypeId,
                        qty: entry[17] ? String(entry[17]) : "",
                        static: entry[18] === "One Time" ? 0 : 1,
                        mobile_number: mobileNumber,
                    });

                    messageMatches.push({
                        contact_masters_id: null, // Will be updated after contact creation
                        a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        description: `Name: ${personName}<br>Email: ${entry[2] || ""
                            }<br><strong>Mobile No.:</strong> <strong>${mobileNumber || ""
                            }</strong><br><strong>Date: </strong><strong>${dateTime || formattedDate
                            }</strong><br>Description: ${description}`,
                        created_date_time: dateTime || formattedDate,
                        message_side: "2",
                        message_type_id: "0",
                        mobile_number: mobileNumber,
                    });
                }
            } catch (error) {
                invalidEntries.push(
                    `Row ${rowNumber}: Error processing entry: ${error.message}`
                );
            }
        }

        // Check if any valid contacts were processed
        if (processedContacts.length === 0) {
            return resError({
                ack_msg:
                    invalidEntries.length > 0
                        ? invalidEntries.join("; ")
                        : "Duplicate data found",
                developer_msg:
                    invalidEntries.length > 0
                        ? invalidEntries.join("; ")
                        : "Duplicate data found",
            });
        }

        // Check user limits
        try {
            const userList = await CTcontactModel.findAll({
                where: {
                    company_masters_id: findCompanyId.company_masters_id,
                    isDelete: 0,
                },
                attributes: ["company_masters_id", "a_application_login_id"],
            });
            const userRightsList = await applicationLoginTypeRightModel.findAll({
                where: {
                    company_masters_id: findCompanyId.company_masters_id,
                    page_id: 1,
                    isDelete: 0,
                },
                attributes: ["a_application_login_id", "a_page_id_rights_jason"],
            });
            const userCount = userList.length;

            for (const userRight of userRightsList) {
                try {
                    const rightsJson = JSON.parse(
                        userRight.dataValues.a_page_id_rights_jason
                    );
                    if (typeof rightsJson.limit === "number") {
                        const totalAfterImport = userCount + processedContacts.length;
                        if (rightsJson.limit > 0 && totalAfterImport > rightsJson.limit) {
                            return resError({
                                ack_msg: `Contact limit reached. Current: ${userCount}, Trying to add: ${processedContacts.length}, Limit: ${rightsJson.limit}`,
                                developer_msg: `Contact limit reached. Current: ${userCount}, Trying to add: ${processedContacts.length}, Limit: ${rightsJson.limit}`,
                            });
                        }
                    }
                } catch (err) {
                    console.error(
                        "Error parsing JSON for a_application_login_id:",
                        userRight.a_application_login_id,
                        err
                    );
                }
            }

            // Bulk create contacts
            const createdContacts = await CTcontactModel.bulkCreate(
                processedContacts,
                {
                    validate: true,
                    returning: true,
                }
            );

            // Map created contact IDs
            const contactIdMap = createdContacts.reduce((map, contact, index) => {
                const key = contact.mobile_number || `index_${index}`;
                map[key] = contact.id;
                return map;
            }, {});

            // Update inquiryMatches and messageMatches with contact IDs
            const validInquiryMatches = [];
            const validMessageMatches = [];
            for (let i = 0; i < inquiryMatches.length; i++) {
                const inquiry = inquiryMatches[i];
                const message = messageMatches[i];
                const key = inquiry.mobile_number || `index_${i}`;
                const contactId = contactIdMap[key];

                if (contactId) {
                    validInquiryMatches.push({
                        ...inquiry,
                        contact_master_id: contactId,
                    });
                    validMessageMatches.push({
                        ...message,
                        contact_masters_id: contactId,
                    });
                } else {
                    invalidEntries.push(
                        `Row ${i + 2}: Missing contact ID for inquiry/message`
                    );
                }
            }

            // Bulk create inquiries and messages
            if (validInquiryMatches.length > 0) {
                await CTinquiryModel.bulkCreate(validInquiryMatches, {
                    validate: true,
                });
            }
            if (validMessageMatches.length > 0) {
                await CTcontactMessageHistory.bulkCreate(validMessageMatches, {
                    validate: true,
                });
            }

            // Construct response message
            const responseMessage = `Successfully imported ${createdContacts.length
                } contacts${invalidEntries.length > 0
                    ? `. Issues: ${invalidEntries.join("; ")}`
                    : ""
                }${duplicateEntries.length > 0
                    ? `. Duplicate data found: ${duplicateEntries.length} entries`
                    : ""
                }`;

            return resSuccess({
                code: 200,
                ack: 1,
                ack_msg: responseMessage,
                developer_msg: responseMessage,
                data: createdContacts.map((contact) => contact.dataValues),
            });
        } catch (bulkError) {
            return resError({
                ack_msg: "Failed to import some contacts, inquiries, or messages",
                developer_msg: `Bulk create error: ${bulkError.message}`,
            });
        }
    } catch (error) {
        return resBadRequest({
            ack_msg: "Failed to process Excel file",
            developer_msg: `Error reading Excel file: ${error.message}`,
        });
    }
};

export const addContactByExcelSheetV2 = async (req) => {
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
            attributes: ["is_contact_validation", "company_name"],
        });

        const a_company_name = companyData?.company_name;
        const a_company_id = findCompanyId.company_masters_id;

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

        // contact_message_histories.description is a Sequelize STRING (VARCHAR(255)) column.
        // The HTML template below is otherwise fixed-length; only the Description portion is
        // variable, so we cap THAT specifically rather than truncating the whole string blindly
        // (which could cut off mid-tag and break the HTML, or silently fail the insert on a
        // "Data too long" DB error if left unchecked).
        const MESSAGE_HISTORY_DESCRIPTION_MAX_LENGTH = 255;
        const buildContactMessageHistoryDescription = (row, dateTimeValue) => {
            const fixedTemplate = (descriptionText) => `Name: ${row?.person_name || ""}<br>Email: ${row?.email_id || ""
                }<br><strong>Mobile No.:</strong> <strong>${row?.mobile_number || ""
                }</strong><br><strong>Date: </strong><strong>${dateTimeValue || formattedDate
                }</strong><br>Description: ${descriptionText}`;

            const fullDescription = row?.description || "";
            let result = fixedTemplate(fullDescription);

            if (result.length > MESSAGE_HISTORY_DESCRIPTION_MAX_LENGTH) {
                // Work out how much room is left for the description text specifically, after
                // accounting for the fixed parts of the template, then trim just that part.
                const overflow = result.length - MESSAGE_HISTORY_DESCRIPTION_MAX_LENGTH;
                const allowedDescriptionLength = Math.max(0, fullDescription.length - overflow - 1);
                result = fixedTemplate(fullDescription.slice(0, allowedDescriptionLength) + (allowedDescriptionLength < fullDescription.length ? "…" : ""));
            }

            return result;
        };

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
            'person_name': 'person_name',
            'company_name': 'company_name',
            'Email': 'email_id',
            'mobile_number': 'mobile_number',
            'client_code': 'client_code',
            'Country': 'country',
            'State': 'state',
            'City': 'city',
            'Area': 'area',
            'Pincode': 'pincode',
            'Address': 'address',
            'shipping_address': 'shipping_address',
            'gst_number': 'gst_number',
            'price_list': 'assinged_to_price_list',
            'source_type': 'source_type_id',
            'label': 'lable',
            'category_name': 'category_id',
            'product_name': 'product_id',
            'required_quantity': 'qty',
            'requirement_type': 'static',
            'Description': 'description',
            'datetime': 'created_date_time',
            'latitude': 'latitude',
            'longitude': 'longitude',
        };

        const customFormFieldModelIntance = customFieldFormModel(req.tenantDB);
        const customFieldDatavaluesModelInstance = customFieldDatavaluesModel(req.tenantDB);

        /** Fetch dynamic custom fields **/
        const getCustomFormFieldR = await customFormFieldModelIntance.findAll({
            where: { form_type: 1, isDelete: 0 },
            attributes: ["title", "reference_column_name", "data_type", "id", "required_or_not"],
            raw: true,
        });

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

        const getCustomFormFieldMandetoryRuleObj = Array.isArray(getCustomFormFieldR)
            ? getCustomFormFieldR.reduce((acc, { reference_column_name, title, data_type, required_or_not }) => {
                if (required_or_not == 1) {
                    acc[reference_column_name] = required_or_not;
                }
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
            'person_name',
            'mobile_number'
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

            const CTcountryModel = countryModel(req.tenantDB);
            const CTstateModel = stateModel(req.tenantDB);
            const CTcityModel = cityModel(req.tenantDB);
            const CTareaModel = areaModel(req.tenantDB);
            const CTcontactModel = contactModel(req.tenantDB);
            const CTpriceListMastersModel = priceListMastersModel(req.tenantDB);
            const CTproductModel = productModel(req.tenantDB);
            const CTsourceTypesModel = sourceTypesModel(req.tenantDB);
            const CTcategoryModel = categoryModel(req.tenantDB);
            const CTinquiryModel = inquiryModel(req.tenantDB);
            const CTcontactMessageHistory = contactMessageHistory(req.tenantDB);
            const labelModelInstance = labelModel(req.tenantDB);

            const sourceTypes = await CTsourceTypesModel.findAll({
                where: {
                    isDelete: 0,
                },
                attributes: ["id", "source_name"],
            });

            const labelTypes = await labelModelInstance.findAll({
                where: {
                    isDelete: 0,
                },
                attributes: ["id", "lable_name"],
            });

            const sourceTypeMap = new Map(
                sourceTypes.map((sourceType) => [
                    sourceType.source_name.toLowerCase(),
                    sourceType.id,
                ])
            );

            const labelTypesMap = new Map(
                labelTypes.map((label) => [
                    label.lable_name.trim().toLowerCase(),
                    label.id,
                ])
            );

            const existingCategories = await CTcategoryModel.findAll({
                where: {
                    isDelete: 0,
                },
            });
            const existingCategoryMap = new Map(
                existingCategories.map((entry) => [
                    entry.category_name?.trim().toLowerCase(),
                    entry.id,
                ])
            );

            let mobileNumberBlankRows = [];
            let personBlankRows = [];
            let customFormFieldBlank = [];
            let inquiryAddedToExistingContactRows = [];
            let descriptionAlreadyExistsRows = [];
            // Maps mobile_number / client_code / gst_number seen earlier IN THIS FILE to the
            // column_5 UUID of the row that will create that brand-new contact (only needed when
            // the contact does NOT already exist in the DB - resolved to a real contact id after
            // bulkCreate). If the contact already exists in the DB, every row independently looks
            // it up directly - no in-file shortcut is used for that case.
            const mobileNumberToColumn5Map = new Map();
            const clientCodeToColumn5Map = new Map();
            const gstNumberToColumn5Map = new Map();
            // Tracks descriptions already queued per column_5, for the brand-new-contact case only
            // (no DB id exists yet to check against, so this in-memory set is the only source of
            // truth for "has this exact description already been added for this contact").
            const queuedDescriptionsByColumn5 = new Map();
            const sanitizedData = [];
            const whatsappEmailSendTeamPersonList = [];
            // Rows whose contact already exists in the DB - inquiry/message will be inserted
            // directly against this known contactId.
            const existingContactInquiryList = [];
            // In-file duplicate rows whose contact is brand-new in THIS upload - contact id is only
            // known AFTER bulkCreate, resolved via column_5 -> contactIdMap.
            const inFileDuplicateInquiryList = [];

            // Checks if this exact description was already recorded for this contact as an
            // inquiry. Re-checked against the DB for every row, every time (no in-memory
            // shortcut), per requirement: any number of duplicate rows for the same contact
            // should each independently add their inquiry unless that exact description already
            // exists for that contact.
            const isDescriptionAlreadyExistsForContact = async (contactId, description) => {
                if (!contactId || !isValid(description)) return false;

                const normalizedDescription = description.toString().trim().replace(/\s+/g, " ");

                const existingInquiryWithDescription = await CTinquiryModel.findOne({
                    where: {
                        isDelete: 0,
                        contact_master_id: contactId,
                        description: normalizedDescription,
                    },
                    raw: true,
                });

                return !!existingInquiryWithDescription;
            };

            // Finds an existing contact by mobile_number, then client_code, then gst_number (first
            // match wins). Always queried fresh against the DB - this is intentionally NOT cached
            // in-memory per file, since duplicate rows must each independently re-check.
            const findExistingContact = async (mobile_number, client_code, gst_number) => {
                if (isValid(mobile_number)) {
                    const byMobile = await CTcontactModel.findOne({
                        where: { isDelete: 0, mobile_number },
                        raw: true,
                    });
                    if (byMobile) return byMobile;
                }
                if (isValid(client_code)) {
                    const byClientCode = await CTcontactModel.findOne({
                        where: { isDelete: 0, client_code },
                        raw: true,
                    });
                    if (byClientCode) return byClientCode;
                }
                if (isValid(gst_number)) {
                    const byGst = await CTcontactModel.findOne({
                        where: { isDelete: 0, gst_number },
                        raw: true,
                    });
                    if (byGst) return byGst;
                }
                return null;
            };

            for (let i = 0; i < filterdData.length; i++) {
                const v = filterdData[i];
                const rowNumber = i + 1;

                const mobile_number = isValid(v.mobile_number) ? normalizeToTenDigit(v.mobile_number.toString().trim()) : "";
                const person_name = isValid(v.person_name) ? v.person_name.toString().trim() : "";
                const client_code = isValid(v?.client_code) ? v?.client_code.toString().trim() : "";
                const country = isValid(v?.country) ? v?.country.toString().trim() : "";
                const state = isValid(v?.state) ? v?.state.toString().trim() : "";
                const city = isValid(v?.city) ? v?.city.toString().trim() : "";
                const areaNamee = isValid(v?.area) ? v?.area.toString().trim() : "";
                const gst_number = isValid(v?.gst_number) ? v?.gst_number.toString().trim() : "";
                const assinged_to_price_list = isValid(v?.assinged_to_price_list) ? v?.assinged_to_price_list.toString().trim() : "";
                const product_name = isValid(v?.product_id) ? v?.product_id.toString().trim() : "";
                const source_type_name = isValid(v?.source_type_id) ? v?.source_type_id.toString().trim() : "";
                const lable_name = isValid(v?.lable) ? v?.lable.toString().trim().split(",") : "";
                const category_name = isValid(v?.category_id) ? v?.category_id.toString().trim() : "";

                // Normalize description in place so every later read of v.description (in-file
                // dedup, DB dedup check, inquiry/message insert) compares the same trimmed value -
                // protects against Excel re-saves introducing stray leading/trailing whitespace.
                if (isValid(v?.description)) {
                    v.description = v.description.toString().trim().replace(/\s+/g, " ");
                }

                /* ================= VALIDATIONS ================= */

                if (!isValid(person_name)) {
                    personBlankRows.push(rowNumber);
                    continue;
                }

                if (!isValid(mobile_number)) {
                    mobileNumberBlankRows.push(rowNumber);
                    continue;
                }

                /* ================= CONTACT DUPLICATE CHECK (mobile_number / client_code / gst_number) =================
                   Rule: if the contact already exists (by any of the 3 identifiers), do NOT create
                   a new contact - but DO add the inquiry/message for this row (regardless of how
                   many duplicate rows exist in the file), UNLESS this exact description already
                   exists for that contact, in which case only the inquiry is skipped. */

                const existingContact = await findExistingContact(mobile_number, client_code, gst_number);

                if (existingContact) {
                    if (isValid(v?.description)) {
                        const descriptionAlreadyExists = await isDescriptionAlreadyExistsForContact(existingContact.id, v.description);
                        if (descriptionAlreadyExists) {
                            descriptionAlreadyExistsRows.push(rowNumber);
                        } else {
                            existingContactInquiryList.push({ contactId: existingContact.id, row: v });
                            inquiryAddedToExistingContactRows.push(rowNumber);
                        }
                    }
                    // No description on this row - nothing to add, contact already exists, so just skip silently (no error bucket needed).
                    continue;
                }

                /* ================= IN-FILE DUPLICATE CHECK (contact not in DB, but repeated in this same Excel file) =================
                   The contact doesn't exist in the DB yet. If an EARLIER row in this same file
                   already queued this exact mobile_number / client_code / gst_number for creation,
                   don't create a second contact - link this row's inquiry/message to that row's
                   contact once it's created (resolved after bulkCreate via column_5).
                   Since this contact has no DB id yet, "already exists" can't be checked against
                   the DB here - instead we track descriptions already queued for this column_5
                   in this same upload, so an exact repeat (like rows 2 and 4 both being
                   "bluetooth speaker" for the same brand-new contact) isn't added twice. */

                const inFileColumn5 =
                    (isValid(mobile_number) && mobileNumberToColumn5Map.get(String(mobile_number))) ||
                    (isValid(client_code) && clientCodeToColumn5Map.get(String(client_code))) ||
                    (isValid(gst_number) && gstNumberToColumn5Map.get(String(gst_number))) ||
                    null;

                if (inFileColumn5) {
                    if (isValid(v?.description)) {
                        const queuedSet = queuedDescriptionsByColumn5.get(inFileColumn5);
                        const alreadyQueued = queuedSet?.has(v.description);

                        if (alreadyQueued) {
                            descriptionAlreadyExistsRows.push(rowNumber);
                        } else {
                            inFileDuplicateInquiryList.push({ column_5: inFileColumn5, row: v });
                            if (!queuedDescriptionsByColumn5.has(inFileColumn5)) queuedDescriptionsByColumn5.set(inFileColumn5, new Set());
                            queuedDescriptionsByColumn5.get(inFileColumn5).add(v.description);
                            inquiryAddedToExistingContactRows.push(rowNumber);
                        }
                    }
                    continue;
                }

                /* ================= CUSTOM FORM FIELD REQURED ================= */
                const required = Object.keys(getCustomFormFieldMandetoryRuleObj).filter(k => getCustomFormFieldMandetoryRuleObj[k] === 1);
                let isCustomFieldRequredFailed = false;
                for (const row of [v]) {
                    const missing = required.filter(field => !row[field]?.toString().trim());

                    if (missing.length) {
                        isCustomFieldRequredFailed = true;
                    }
                }

                if (isCustomFieldRequredFailed) {
                    customFormFieldBlank.push(rowNumber);
                    continue;
                }

                /* ================= PRICE LIST ================= */

                let price_list_id = 0;
                if (isValid(assinged_to_price_list)) {
                    const price_list_idDb = await CTpriceListMastersModel.findOne({
                        where: {
                            isDelete: 0,
                            price_list_name: assinged_to_price_list,
                            a_application_login_id,
                            company_masters_id: findCompanyId.company_masters_id,
                        },
                        raw: true,
                        attributes: ["id"],
                    });
                    price_list_id = price_list_idDb?.id || 0;
                }

                /* ================= PRODUCT ================= */

                let product_id = 0;
                if (isValid(product_name)) {
                    const product_idDB = await CTproductModel.findOne({
                        where: {
                            isDelete: 0,
                            a_application_login_id,
                            company_masters_id: findCompanyId.company_masters_id,
                            product_name,
                        },
                        raw: true,
                        attributes: ["id"],
                    });
                    product_id = product_idDB?.id || 0;
                }

                /* ================= SOURCE TYPE ================= */

                const sourceTypeId = sourceTypeMap.get(source_type_name.toLowerCase()) || 0;

                /* ================= Label Set ================= */
                const lable_id = isValid(lable_name) ? lable_name.map(e => labelTypesMap.get(e.toLowerCase().trim())).filter(v => v != null).join(",") : "";
                /* ================= CATEGORY (SAFE) ================= */

                let categoryId = -1;
                if (category_name) {
                    const normalizedCategoryName = toTitleCase(category_name);
                    categoryId = existingCategoryMap.get(normalizedCategoryName.toLowerCase()) || -1;

                    if (categoryId === -1) {
                        const createdCategory = await CTcategoryModel.create({
                            company_masters_id: findCompanyId.company_masters_id,
                            a_application_login_id,
                            category_name: normalizedCategoryName,
                            created_date_time: formattedDate,
                        });

                        categoryId = createdCategory.id;
                        existingCategoryMap.set(normalizedCategoryName.toLowerCase(), categoryId);
                    }
                }

                /* ================= COUNTRY / STATE / CITY / AREA ================= */

                let countryId = 0,
                    stateId = 0,
                    cityId = 0,
                    areaId = 0;

                const countryName = isValid(country) ? toTitleCase(country) : "";

                if (countryName) {
                    const countryDb = await CTcountryModel.findOne({
                        where: { country_name: countryName },
                        raw: true,
                        attributes: ["id"],
                    });

                    if (countryDb) {
                        countryId = countryDb.id;

                        const stateName = isValid(state) ? toTitleCase(state) : "";
                        if (stateName) {
                            const stateDb = await CTstateModel.findOne({
                                where: { state_name: stateName, country_id: countryId },
                                raw: true,
                                attributes: ["id"],
                            });

                            if (stateDb) {
                                stateId = stateDb.id;

                                const cityName = isValid(city) ? toTitleCase(city) : "";
                                if (cityName) {
                                    const cityDb = await CTcityModel.findOne({
                                        where: { city_name: cityName, state_id: stateId },
                                        raw: true,
                                        attributes: ["id"],
                                    });

                                    if (cityDb) {
                                        cityId = cityDb.id;

                                        const areaName = isValid(areaNamee) ? toTitleCase(areaNamee) : "";
                                        if (areaName) {
                                            const areaDb = await CTareaModel.findOne({
                                                where: { area_name: areaName, city_id: cityId },
                                                raw: true,
                                                attributes: ["id"],
                                            });
                                            areaId = areaDb?.id || 0;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                /* ================= DATE ================= */

                let dateTime = null;
                const dateTimeCell = v?.created_date_time;

                if (typeof dateTimeCell === "number") {
                    const jsDate = moment(
                        XLSX.SSF.format("yyyy-mm-dd hh:mm:ss", dateTimeCell)
                    ).toDate();
                    dateTime = moment(jsDate).format("YYYY-MM-DD HH:mm:ss");
                } else if (typeof dateTimeCell === "string" && dateTimeCell.trim()) {
                    dateTime = moment(dateTimeCell).isValid()
                        ? moment(dateTimeCell).format("YYYY-MM-DD HH:mm:ss")
                        : formattedDate;
                }

                /* ================= AUTO ASSIGN ================= */

                const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
                    source_type_id: sourceTypeId,
                    country_id: countryId,
                    state_id: stateId,
                    area_id: areaId,
                    description: `${v?.product_name} ${v?.Description}`
                });

                const contactAssignedIdsStr = isValid(contactAssignedIds?.data?.assignedIds) ? contactAssignedIds?.data?.assignedIds?.join(",") : "";

                if (contactAssignedIds?.data?.isWhatsappEmailSendEnabled && (contactAssignedIds?.data?.assignedIds?.length == 1 || isValid(contactAssignedIds?.data?.template_id))) {
                    whatsappEmailSendTeamPersonList.push(
                        {
                            team_id: contactAssignedIdsStr,
                            send_message: contactAssignedIds?.data?.send_description,
                            template_id: contactAssignedIds?.data?.template_id
                        }
                    )
                }

                /* ================= FINAL OBJECT ================= */

                const column_5 = generateTimeBasedPrefixedUUID("SHEET-IMPORT");

                // Track this row as the "creator" row for its mobile_number / client_code / gst_number,
                // so later duplicate rows for the same contact within this same file can
                // attach their inquiry/message to this row's contact once it's created.
                if (isValid(mobile_number)) {
                    mobileNumberToColumn5Map.set(String(mobile_number), column_5);
                }
                if (isValid(client_code)) {
                    clientCodeToColumn5Map.set(String(client_code), column_5);
                }
                if (isValid(gst_number)) {
                    gstNumberToColumn5Map.set(String(gst_number), column_5);
                }
                // Seed this row's own description so a later in-file duplicate row with the exact
                // same description (for this same brand-new contact) is correctly recognized as
                // already added, rather than queued again.
                if (isValid(v?.description)) {
                    if (!queuedDescriptionsByColumn5.has(column_5)) queuedDescriptionsByColumn5.set(column_5, new Set());
                    queuedDescriptionsByColumn5.get(column_5).add(v.description);
                }

                const objCreated = {
                    ...v,
                    country: countryId || "",
                    state: stateId || "",
                    city: cityId || "",
                    area: areaId || "",
                    assinged_to_price_list: price_list_id || "",
                    product_id,
                    source_type_id: sourceTypeId || "",
                    lable: lable_id || "",
                    category_id: categoryId || "",
                    mobile_number,
                    raw_mobile_number: v.mobile_number || "",
                    created_date_time: dateTime || "",
                    assinged_to_work_a_application_id:
                        contactAssignedIdsStr || a_application_login_id,
                    column_5,
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
                { rows: personBlankRows, text: "Person name is blank" },
                { rows: mobileNumberBlankRows, text: "Mobile number is blank" },
                { rows: customFormFieldBlank, text: "A mandatory custom field is blank" },
                { rows: inquiryAddedToExistingContactRows, text: "Contact already exists, inquiry and message added to the existing contact" },
                { rows: descriptionAlreadyExistsRows, text: "This description already exists for this contact, so it was not added again" },
            ];

            // Build message - each bucket's text already reads as a complete sentence, no trailing period added here
            let responseMessage = messageMap
                .filter(item => isValid(item.rows))
                .map(item =>
                    item.rows
                        .map(row => `Row Number ${row}: ${item.text}.<br/>`)
                        .join("")
                )
                .join("");

            if (!isValid(sanitizedData) && !isValid(existingContactInquiryList) && !isValid(inFileDuplicateInquiryList)) {
                return resError({
                    ack_msg: responseMessage || "No data could be imported. Please check the file and try again.",
                    developer_msg: "All rows were skipped during validation.",
                    data: responseMessage || ""
                });
            }

            const contactInsertData = sanitizedData.map(
                ({ category_id, product_id, qty, static: _static, description, ...rest }) => {
                    return {
                        ...rest,
                        created_date_time: rest.created_date_time || formattedDate,
                        person_name: rest.person_name,
                        client_code: rest.client_code || "",
                        mobile_number: rest.mobile_number || "",
                        email_id: rest.email_id || "",
                        pincode: rest.pincode || "",
                        address: rest.address || "",
                        a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        source_type_id: rest.source_type_id || "",
                        lable: rest.lable || "",
                        shipping_address: rest.shipping_address || "",
                        gst_number: rest.gst_number || "",
                        assinged_to_price_list: rest.assinged_to_price_list || "",
                        company_name: rest.company_name || "",
                        assinged_to_work_a_application_id: rest.assinged_to_work_a_application_id || ""
                    };
                }
            );

            // Check user limits
            const userList = await CTcontactModel.findAll({
                where: {
                    company_masters_id: findCompanyId.company_masters_id,
                    isDelete: 0,
                },
                attributes: ["company_masters_id", "a_application_login_id"],
            });
            const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
            const userRightsList = await applicationLoginTypeRightModelIntance.findAll({
                where: {
                    company_masters_id: findCompanyId.company_masters_id,
                    page_id: 1,
                    isDelete: 0,
                },
                attributes: ["a_application_login_id", "a_page_id_rights_jason"],
            });
            const userCount = userList.length;

            for (const userRight of userRightsList) {
                try {
                    const rightsJson = JSON.parse(
                        userRight.dataValues.a_page_id_rights_jason
                    );
                    if (typeof rightsJson.limit === "number") {
                        const totalAfterImport = userCount + contactInsertData.length;
                        if (rightsJson.limit > 0 && totalAfterImport > rightsJson.limit) {
                            return resError({
                                ack_msg: `Contact limit reached. Current: ${userCount}, Trying to add: ${contactInsertData.length}, Limit: ${rightsJson.limit}`,
                                developer_msg: `Contact limit reached. Current: ${userCount}, Trying to add: ${contactInsertData.length}, Limit: ${rightsJson.limit}`,
                            });
                        }
                    }
                } catch (err) {
                    console.error(
                        "Error parsing JSON for a_application_login_id:",
                        userRight.a_application_login_id,
                        err
                    );
                }
            }

            // Bulk create contacts
            const createdContacts = contactInsertData.length > 0 ? await CTcontactModel.bulkCreate(
                contactInsertData,
                {
                    validate: true,
                    returning: true,
                }
            ) : [];

            {
                const contactEmailSendList = [];
                const contactWhatsappSendList = [];
                if (isValid(createdContacts)) {
                    await Promise.all(
                        createdContacts.map((v) => {
                            if (isValid(whatsappEmailSendTeamPersonList) && isValid(v.email_id)) {
                                const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == v.assinged_to_work_a_application_id);
                                if (result) {
                                    contactEmailSendList.push({
                                        email_id: v.email_id,
                                        contact_detail: {
                                            person_name: v.person_name,
                                            mobile_number: v.mobile_number,
                                            company_name: v.company_name
                                        },
                                        team_person: v.assinged_to_work_a_application_id,
                                        company_name: a_company_name,
                                        a_company_id: a_company_id,
                                        send_message: result?.send_message,
                                    });
                                }
                            }
                            if (isValid(whatsappEmailSendTeamPersonList) && isValid(v.mobile_number)) {
                                const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == v.assinged_to_work_a_application_id);
                                if (result) {
                                    contactWhatsappSendList.push({
                                        whatsapp_number: v.mobile_number,
                                        contact_detail: {
                                            person_name: v.person_name,
                                            mobile_number: v.mobile_number,
                                            company_name: v.company_name,
                                            customer_id: v.id
                                        },
                                        team_person: v.assinged_to_work_a_application_id,
                                        company_name: a_company_name,
                                        a_company_id: a_company_id,
                                        send_message: result?.send_message,
                                        template_id: result?.template_id,
                                    });
                                }
                            }
                        })
                    )
                    await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList, contactEmailSendList });
                }

                const contactIdMap = createdContacts.reduce((map, contact, index) => {
                    const key = contact.column_5 || `index_${index}`;
                    map[key] = contact.id;
                    return map;
                }, {});

                let inquiryInsert = [];
                let messageInsert = [];
                sanitizedData.map((v, i) => {
                    if (isValid(v?.description)) {
                        const key = v.column_5 || `index_${i}`;
                        const contactId = contactIdMap[key];

                        inquiryInsert.push({
                            contact_master_id: contactId,
                            product_id: v?.product_id || "",
                            category_id: v?.category_id || "",
                            description: v?.description || "",
                            inquiry_date_time: v?.created_date_time || formattedDate,
                            a_application_login_id,
                            company_masters_id: findCompanyId.company_masters_id,
                            source_type_id: v?.source_type_id || "",
                            qty: v?.qty || "",
                            static: v?.static || 0,
                        });

                        messageInsert.push({
                            contact_masters_id: contactId,
                            a_application_login_id,
                            company_masters_id: findCompanyId.company_masters_id,
                            description: buildContactMessageHistoryDescription(v, v?.created_date_time),
                            created_date_time: v?.created_date_time || formattedDate,
                            message_side: "2",
                            message_type_id: "0",
                        });
                    }
                })

                // ===== NEW: build inquiry/message rows for EXISTING contacts found duplicate during import =====
                existingContactInquiryList.map(({ contactId, row: v }) => {
                    inquiryInsert.push({
                        contact_master_id: contactId,
                        product_id: v?.product_id || "",
                        category_id: v?.category_id || "",
                        description: v?.description || "",
                        inquiry_date_time: v?.created_date_time || formattedDate,
                        a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        source_type_id: v?.source_type_id || "",
                        qty: v?.qty || "",
                        static: v?.static || 0,
                    });

                    messageInsert.push({
                        contact_masters_id: contactId,
                        a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        description: buildContactMessageHistoryDescription(v, v?.created_date_time),
                        created_date_time: v?.created_date_time || formattedDate,
                        message_side: "2",
                        message_type_id: "0",
                    });
                })

                // ===== NEW: build inquiry/message rows for IN-FILE duplicate rows (same mobile/client_code repeated within this Excel file) =====
                inFileDuplicateInquiryList.map(({ column_5, row: v }) => {
                    const contactId = contactIdMap[column_5];
                    if (!contactId) return; // creator row failed validation/insert for some reason - skip safely

                    inquiryInsert.push({
                        contact_master_id: contactId,
                        product_id: v?.product_id || "",
                        category_id: v?.category_id || "",
                        description: v?.description || "",
                        inquiry_date_time: v?.created_date_time || formattedDate,
                        a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        source_type_id: v?.source_type_id || "",
                        qty: v?.qty || "",
                        static: v?.static || 0,
                    });

                    messageInsert.push({
                        contact_masters_id: contactId,
                        a_application_login_id,
                        company_masters_id: findCompanyId.company_masters_id,
                        description: buildContactMessageHistoryDescription(v, v?.created_date_time),
                        created_date_time: v?.created_date_time || formattedDate,
                        message_side: "2",
                        message_type_id: "0",
                    });
                })

                // Bulk create inquiries and messages
                if (inquiryInsert.length > 0) {
                    await CTinquiryModel.bulkCreate(inquiryInsert, {
                        validate: true,
                    });
                }
                if (messageInsert.length > 0) {
                    await CTcontactMessageHistory.bulkCreate(messageInsert, {
                        validate: true,
                    });
                }

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