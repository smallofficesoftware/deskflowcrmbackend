import fs from "fs-extra";
import { google } from "googleapis";
import moment from "moment";
import path from "path";
import Sequelize, { Op } from "sequelize";
import sequelize from "../../config/sequelize.js";
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
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { workflowAutomationsModel } from "../../models/other_settings/workflowAutomationsModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { priceListMastersModel } from "../../models/product_settings/priceListMastersModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { GOOGLE_SHEET_DECLARED_COLUMN_LIST, WORKFLOW_AUTOMATIONS_TYPES } from "../../utils/AppEnumeration.js";
import {
    formatDateTimeValue,
    generateNumber,
    generateOTP,
    isValid,
    normalizeToTenDigit,
    parseDate,
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId, insertStagesAndStatusLogs } from "../commonServices.js";
import {
    autoAssignmentContactIdsGet,
    prepareMailAndWhatsappSenderToTheContact
} from "../other_settings/wrkflwAutoAssignmentContactService.js";

// ==================== CONSTANTS ====================
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const MAX_ROWS_TO_FETCH = 25;
const DEFAULT_SHEET_NAME = "Sheet1";
const DEFAULT_SOURCE_TYPE_ID = 0;

// ==================== UTILITY FUNCTIONS ====================

/**
 * Normalize string for case-insensitive comparison
 */
const normalize = (name) => {
    if (typeof name !== "string") return "";
    return name.trim().toLowerCase();
};

/**
 * Safe JSON parse with fallback
 */
const safeJsonParse = (jsonString, fallback = null) => {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("JSON parse error:", error);
        return fallback;
    }
};

/**
 * Safe date parsing with fallback
 */
const safeDateParse = (dateValue, fallback = null) => {
    try {
        if (!isValid(dateValue)) return fallback;
        const parsed = parseDate(dateValue);
        return parsed || fallback;
    } catch (error) {
        console.error("Date parse error:", error);
        return fallback;
    }
};

/**
 * Load Google credentials safely
 */
const loadGoogleCredentials = () => {
    const credentialsPath = path.join(process.cwd(), "credentials.json");

    if (!fs.existsSync(credentialsPath)) {
        throw new Error(`Credentials file not found: ${credentialsPath}`);
    }

    const fileContent = fs.readFileSync(credentialsPath, "utf8");
    return safeJsonParse(fileContent);
};

// ==================== CAMPAIGN SYNC ====================

/**
 * Sync campaigns with database - ensure all campaigns exist
 * @returns {Object} Maps for campaign lookups
 */
async function syncCampaigns(
    currentExcelDataFilter,
    sourceTypeModel,
    a_application_login_id,
    company_masters_id
) {
    try {
        // Extract unique campaign names
        const campaignNames = [
            ...new Set(
                currentExcelDataFilter
                    .map(v => v?.campaign_name?.[0])
                    .filter(name => typeof name === "string" && name.trim())
                    .map(normalize)
            )
        ];

        if (!campaignNames.length) {
            return {
                campaignMap: new Map(),
                reverseMap: new Map(),
                campaignData: {}
            };
        }

        // Fetch existing campaigns in single query
        const existing = await sourceTypeModel.findAll({
            where: {
                source_name: campaignNames,
                isDelete: 0
            },
            attributes: ["id", "source_name"],
            raw: true
        });

        const existingSet = new Set(existing.map(e => normalize(e.source_name)));

        // Find campaigns that need to be created
        const newCampaigns = campaignNames
            .filter(name => !existingSet.has(name))
            .map(name => ({
                source_name: name,
                color: '#357DED',
                company_masters_id,
                a_application_login_id,
                isDelete: 0
            }));

        // Bulk insert new campaigns
        if (newCampaigns.length > 0) {
            await sourceTypeModel.bulkCreate(newCampaigns, {
                ignoreDuplicates: true
            });
        }

        // Fetch all campaigns (existing + newly created)
        const allCampaigns = await sourceTypeModel.findAll({
            where: {
                source_name: campaignNames,
                isDelete: 0
            },
            attributes: ["id", "source_name"],
            raw: true
        });

        // Build lookup maps
        const campaignMap = new Map();
        const reverseMap = new Map();
        const campaignData = {};

        allCampaigns.forEach(campaign => {
            const normalizedName = normalize(campaign.source_name);
            campaignMap.set(normalizedName, campaign.id);
            reverseMap.set(campaign.id, campaign.source_name);
            campaignData[normalizedName] = campaign.id;
        });

        return { campaignMap, reverseMap, campaignData };

    } catch (error) {
        console.error("Error syncing campaigns:", error);
        throw new Error(`Campaign sync failed: ${error.message}`);
    }
}

// ==================== GOOGLE SHEETS DATA FETCHING ====================

/**
 * Fetch and parse data from a single Google Sheet
 */
async function fetchSheetData(
    sheets,
    spreadsheetId,
    sheetName,
    workflowAutomationType,
    defaultSourceType,
    sheetIndex,
    CTWorkFlowAutomationsModel
) {
    try {
        // Get customized column mappings
        const customizedColumnsData = await CTWorkFlowAutomationsModel.findOne({
            where: {
                type: workflowAutomationType,
                isDelete: 0,
            },
            attributes: ["raw_values"],
            raw: true
        });

        let customizedSetColumns = customizedColumnsData
            ? safeJsonParse(customizedColumnsData.raw_values, {})
            : {};

        // Ensure required columns
        customizedSetColumns = {
            ...customizedSetColumns,
            id: 'id',
            campaign_name: 'campaign_name'
        };

        // Trim all column values
        customizedSetColumns = Object.fromEntries(
            Object.entries(customizedSetColumns).map(([key, value]) => [
                key,
                typeof value === 'string' ? value.trim() : value
            ])
        );

        // Fetch header row
        const headerRange = `${sheetName}!A1:BO1`;
        const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: headerRange,
        });

        const titleColumnNames = headerResponse?.data?.values?.[0] || [];

        if (!titleColumnNames.length) {
            console.warn(`No headers found in sheet: ${sheetName}`);
            return [];
        }

        const trimmedHeaders = titleColumnNames.map(v => v?.trim() || "");

        // Validate 'id' column exists
        if (!trimmedHeaders.includes("id")) {
            throw new Error(`'id' column not found in sheet: ${sheetName}`);
        }

        // Get total row count
        const columnARange = `${sheetName}!A:A`;
        const columnAResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: columnARange,
        });

        const totalRows = columnAResponse?.data?.values?.length || 0;

        if (totalRows <= 1) {
            console.warn(`No data rows in sheet: ${sheetName}`);
            return [];
        }

        // Calculate data range to fetch (last 25 rows or less)
        const startRow =
            totalRows > 11
                ? Math.max(totalRows - MAX_ROWS_TO_FETCH, 2)
                : 2;

        const dataRange = `${sheetName}!A${startRow}:BO${totalRows}`;

        const dataResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: dataRange,
        });

        let dataRows = dataResponse?.data?.values || [];

        // Skip first row if it is header row
        if (dataRows.length > 0) {
            const firstRow = dataRows[0];

            // Example check: first column contains header text
            if (
                firstRow[0]?.toLowerCase()?.includes("id") /* || // change as needed
                firstRow[0] === "Header Name" */
            ) {
                dataRows = dataRows.slice(1);
            }
        }

        // Parse rows into structured objects
        const parsedData = dataRows.map(row => {
            const rowObject = {};

            row.forEach((cellValue, columnIndex) => {
                const headerName = trimmedHeaders[columnIndex];
                if (!headerName) return;

                // Find matching key in customized columns
                const mappingKey = Object.keys(customizedSetColumns).find(k =>
                    normalize(customizedSetColumns[k]) === normalize(headerName)
                );

                if (mappingKey) {
                    rowObject[mappingKey] = [cellValue, customizedSetColumns[mappingKey]];
                }
            });

            // Add default source type if not present
            if (!rowObject.source_type) {
                rowObject.source_type = [defaultSourceType, 'source_type'];
            }

            // Prefix ID with sheet identifier
            if (rowObject.id) {
                rowObject.id = [`sheet${sheetIndex}_${rowObject.id[0]}`, 'id'];
            }

            return rowObject;
        });

        return parsedData.filter(row => Object.keys(row).length > 0);

    } catch (error) {
        console.error(`Error fetching sheet data for ${sheetName}:`, error);
        throw error;
    }
}

/**
 * Fetch data from all configured Google Sheets
 */
async function fetchAllSheetsData(
    googleSheetsConfig,
    sheets,
    CTWorkFlowAutomationsModel
) {
    const allSheetData = [];
    let sheetIndex = 0;

    for (const [configKey, [spreadsheetId, workflowType, sourceType, customSheetName]] of Object.entries(googleSheetsConfig)) {
        sheetIndex++;

        if (!spreadsheetId || !spreadsheetId.trim()) {
            continue;
        }

        try {
            const sheetName = customSheetName || DEFAULT_SHEET_NAME;

            const sheetData = await fetchSheetData(
                sheets,
                spreadsheetId,
                sheetName,
                workflowType,
                sourceType,
                sheetIndex,
                CTWorkFlowAutomationsModel
            );

            allSheetData.push(...sheetData);

        } catch (error) {
            console.error(`Failed to fetch data from sheet config: ${configKey}`, error);
            throw new Error(`Sheet fetch failed (${configKey}): ${error.message}`);
        }
    }

    return allSheetData;
}

// ==================== DATA VALIDATION & NORMALIZATION ====================

/**
 * Validate and normalize contact data
 */
function validateAndNormalizeData(flattenedData, lastContactId) {
    const invalidEntries = [];
    const duplicateEntries = new Set();
    const mobileNumberCount = {};
    const gstNumberCount = {};

    // Normalize all entries
    const normalizedData = flattenedData.map((entry, index) => {
        let personName = entry['person_name']?.[0] || "Unknown";
        let mobileNumber = entry['mobile_number']?.[0];
        let phoneNumber = entry['phone_number']?.[0];
        let description = entry['Description']?.[0];
        let dateTime = entry['DateTime']?.[0];

        mobileNumber = normalizeToTenDigit(mobileNumber);

        if (!isValid(mobileNumber) && isValid(phoneNumber)) {
            mobileNumber = normalizeToTenDigit(phoneNumber);
        }
        if (!isValid(phoneNumber) && isValid(mobileNumber)) {
            phoneNumber = mobileNumber;
        }
        if (!isValid(mobileNumber)) {
            mobileNumber = generateNumber(1234567890, lastContactId + index + 1);
        }

        return {
            ...entry,
            person_name: [personName, entry['person_name']?.[1]],
            mobile_number: [mobileNumber, entry['mobile_number']?.[1]],
            phone_number: [phoneNumber, entry['phone_number']?.[1] || "Auto Generated"],
            Description: [description, entry['Description']?.[1]],
            DateTime: [dateTime, entry['DateTime']?.[1]]
        };
    });

    // Count total occurrences of each mobile/GST number
    normalizedData.forEach((entry) => {
        const mobileNumber = normalizeToTenDigit(entry['mobile_number']?.[0]);
        const gstNumber = entry['gst_number']?.[0];

        if (mobileNumber) {
            mobileNumberCount[mobileNumber] = (mobileNumberCount[mobileNumber] || 0) + 1;
        }
        if (isValid(gstNumber)) {
            gstNumberCount[gstNumber] = (gstNumberCount[gstNumber] || 0) + 1;
        }
    });

    // Keep the FIRST occurrence of a duplicated number, drop only the extras
    const seenMobileNumbers = new Set();
    const seenGstNumbers = new Set();

    const filteredData = normalizedData.filter((entry) => {
        const mobileNumber = normalizeToTenDigit(entry['mobile_number']?.[0]);
        const gstNumber = entry['gst_number']?.[0];

        if (mobileNumber && mobileNumberCount[mobileNumber] > 1) {
            if (seenMobileNumbers.has(mobileNumber)) {
                duplicateEntries.add(`mobile number: ${mobileNumber}`);
                return false; // drop repeat, first one already kept
            }
            seenMobileNumbers.add(mobileNumber);
        }

        if (isValid(gstNumber) && gstNumberCount[gstNumber] > 1) {
            if (seenGstNumbers.has(gstNumber)) {
                duplicateEntries.add(`gst number: ${gstNumber}`);
                return false;
            }
            seenGstNumbers.add(gstNumber);
        }

        return true;
    });

    return {
        filteredData,
        duplicateEntries: Array.from(duplicateEntries),
        invalidEntries
    };
}
// ==================== DATABASE LOOKUPS ====================

/**
 * Build lookup maps for all master data in single queries
 */
async function buildLookupMaps(req, a_application_login_id, company_masters_id) {
    const CTSourceTypeModel = sourceTypesModel(req.tenantDB);
    const CTproductModel = productModel(req.tenantDB);
    const CTcategoryModel = categoryModel(req.tenantDB);
    const CTpriceListMastersModel = priceListMastersModel(req.tenantDB);
    const CTlabelModel = labelModel(req.tenantDB);

    // Parallel fetch all lookup data
    const [sourceTypes, labels, products, categories, priceLists] = await Promise.all([
        CTSourceTypeModel.findAll({
            where: { isDelete: 0 },
            attributes: ["id", "source_name"],
            raw: true
        }),
        CTlabelModel.findAll({
            where: { isDelete: 0 },
            attributes: ["id", "lable_name"],
            raw: true
        }),
        CTproductModel.findAll({
            where: {
                isDelete: 0,
                a_application_login_id,
                company_masters_id,
            },
            attributes: ["id", "product_name"],
            raw: true
        }),
        CTcategoryModel.findAll({
            where: {
                isDelete: 0,
                a_application_login_id,
                company_masters_id,
            },
            attributes: ["id", "category_name"],
            raw: true
        }),
        CTpriceListMastersModel.findAll({
            where: {
                isDelete: 0,
                a_application_login_id,
                company_masters_id,
            },
            attributes: ["id", "price_list_name"],
            raw: true
        })
    ]);

    return {
        sourceTypeMap: new Map(sourceTypes.map(s => [normalize(s.source_name), s.id])),
        sourceTypeReverseMap: new Map(sourceTypes.map(s => [s.id, normalize(s.source_name)])),
        labelsMap: new Map(labels.map(l => [normalize(l.lable_name), l.id])),
        productsMap: new Map(products.map(p => [p.product_name, p.id])),
        categoriesMap: new Map(categories.map(c => [c.category_name, c.id])),
        priceListsMap: new Map(priceLists.map(pl => [pl.price_list_name, pl.id]))
    };
}

/**
 * Batch check for existing contacts and GST numbers
 */
async function batchCheckExistingContacts(
    mobileNumbers,
    gstNumbers,
    CTContactModelModel,
    a_application_login_id,
    company_masters_id
) {
    const validMobiles = mobileNumbers.filter(m => isValid(m));
    const validGsts = gstNumbers.filter(g => isValid(g));

    const [existingByMobile, existingByGst] = await Promise.all([
        validMobiles.length > 0 ? CTContactModelModel.findAll({
            where: {
                isDelete: 0,
                mobile_number: validMobiles,
                [Op.or]: [
                    { a_application_login_id },
                    { company_masters_id }
                ]
            },
            attributes: ["id", "mobile_number", "gst_number"],
            raw: true
        }) : [],
        validGsts.length > 0 ? CTContactModelModel.findAll({
            where: {
                isDelete: 0,
                gst_number: validGsts,
                [Op.or]: [
                    { a_application_login_id },
                    { company_masters_id }
                ]
            },
            attributes: ["id", "mobile_number", "gst_number"],
            raw: true
        }) : []
    ]);

    const mobileMap = new Map(existingByMobile.map(c => [c.mobile_number, c]));
    const gstMap = new Map(existingByGst.map(c => [c.gst_number, c]));

    return { mobileMap, gstMap };
}

/**
 * Batch fetch location IDs (country, state, city, area)
 */
async function batchFetchLocationIds(entries, req) {
    const CTCountryModel = countryModel(req.tenantDB);
    const CTStateModel = stateModel(req.tenantDB);
    const CTCityModel = cityModel(req.tenantDB);
    const CTAreaModel = areaModel(req.tenantDB);

    // Extract unique location names
    const countries = [...new Set(entries.map(e => e['Country']?.[0]).filter(Boolean))];
    const states = [...new Set(entries.map(e => e['State']?.[0]).filter(Boolean))];
    const cities = [...new Set(entries.map(e => e['City']?.[0]).filter(Boolean))];
    const areas = [...new Set(entries.map(e => e['Area']?.[0]).filter(Boolean))];

    // Fetch all locations in parallel
    const [countryData, stateData, cityData, areaData] = await Promise.all([
        countries.length > 0 ? CTCountryModel.findAll({
            where: { country_name: countries },
            attributes: ["id", "country_name"],
            raw: true
        }) : [],
        states.length > 0 ? CTStateModel.findAll({
            where: { state_name: states },
            attributes: ["id", "state_name", "country_id"],
            raw: true
        }) : [],
        cities.length > 0 ? CTCityModel.findAll({
            where: { city_name: cities },
            attributes: ["id", "city_name", "state_id"],
            raw: true
        }) : [],
        areas.length > 0 ? CTAreaModel.findAll({
            where: { area_name: areas },
            attributes: ["id", "area_name", "city_id"],
            raw: true
        }) : []
    ]);

    // Build lookup maps
    const countryMap = new Map(countryData.map(c => [c.country_name, c]));
    const stateMap = new Map(stateData.map(s => [`${s.state_name}_${s.country_id}`, s]));
    const cityMap = new Map(cityData.map(c => [`${c.city_name}_${c.state_id}`, c]));
    const areaMap = new Map(areaData.map(a => [`${a.area_name}_${a.city_id}`, a]));

    return { countryMap, stateMap, cityMap, areaMap };
}

// ==================== CONTACT PROCESSING ====================

/**
 * Process contacts and prepare for bulk insertion
 */
async function processContactsForInsertion(
    filteredData,
    lookupMaps,
    campaignMap,
    existingContacts,
    locationMaps,
    req,
    a_application_login_id,
    company_masters_id
) {
    const processedContacts = [];
    const inquiryMatches = [];
    const messageMatches = [];
    const whatsappEmailSendList = [];
    const duplicateEntries = [];
    const existingUniqueKeys = await getExistingUniqueKeys(req);
    const existingUniqueKeysFromContact = await getExistingUniqueKeysOfContact(req);
    const existingUniqueKeysFromInquiry = await getExistingUniqueKeysFromInquiry(req);

    for (const entry of filteredData) {
        const currentDateTime = new Date();
        const formatDateTime = safeDateParse(
            entry['DateTime']?.[0],
            moment(currentDateTime).format("YYYY-MM-DD HH:mm:ss")
        );

        const uniqueUserDefineId = isValid(entry['id']?.[0])
            ? entry['id'][0]
            : `DEFAULT_RNDM_NO:${generateOTP(10)}`;

        const mobileNumber = normalizeToTenDigit(entry['mobile_number']?.[0]);
        const gstNumber = entry['gst_number']?.[0]?.trim() || null;

        // Check if contact already exists
        const existingContact = existingContacts.mobileMap.get(mobileNumber);
        const existingContactGst = gstNumber ? existingContacts.gstMap.get(gstNumber) : null;

        const isDuplicate = !!(existingContact || existingContactGst);

        if (existingContact) {
            duplicateEntries.push(`Duplicate mobile: ${mobileNumber}`);
        }
        if (existingContactGst) {
            duplicateEntries.push(`Duplicate GST: ${gstNumber}`);
        }

        const contactId = isDuplicate ? (existingContact?.id || existingContactGst?.id) : undefined;

        // Resolve IDs from lookup maps
        const productId = lookupMaps.productsMap.get(entry['product_name']?.[0]?.trim() || "");
        const categoryId = lookupMaps.categoriesMap.get(entry['category_name']?.[0]?.trim() || "");
        const priceListId = lookupMaps.priceListsMap.get(entry['price_list']?.[0]?.trim() || "");
        const labelId = lookupMaps.labelsMap.get(normalize(entry['lable']?.[0] || ""));

        const campaignSourceTypeId = entry['campaign_name']?.[0]
            ? campaignMap.get(normalize(entry['campaign_name'][0]))
            : null;

        const normalizedSourceType = normalize(entry['source_type']?.[0] || "");
        const sourceTypeId = campaignSourceTypeId || lookupMaps.sourceTypeMap.get(normalizedSourceType) || DEFAULT_SOURCE_TYPE_ID;

        // Resolve location IDs
        const locationIds = resolveLocationIds(entry, locationMaps);

        // Create new contact if not duplicate
        if (!isDuplicate) {
            const contactAssignment = await autoAssignmentContactIdsGet(req, {
                source_type_id: sourceTypeId,
                country_id: locationIds.countryId,
                state_id: locationIds.stateId,
                city_id: locationIds.cityId,
                area_id: locationIds.areaId,
                description: `${entry['Description']?.[0] || ''} ${entry['product_name']?.[0] || ''}`
            });

            const assignedIds = contactAssignment?.data?.assignedIds?.join(",") || "";

            if (contactAssignment?.data?.isWhatsappEmailSendEnabled &&
                (contactAssignment?.data?.assignedIds?.length === 1 || isValid(contactAssignment?.data?.template_id))) {
                whatsappEmailSendList.push({
                    team_id: assignedIds,
                    send_message: contactAssignment.data.send_description,
                    template_id: contactAssignment?.data?.template_id
                });
            }
            if (!existingUniqueKeysFromContact.has(uniqueUserDefineId)) {
                processedContacts.push(buildContactObject(
                    entry,
                    assignedIds,
                    formatDateTime,
                    mobileNumber,
                    gstNumber,
                    sourceTypeId,
                    locationIds,
                    priceListId,
                    labelId,
                    a_application_login_id,
                    company_masters_id,
                    uniqueUserDefineId
                ));
            }
        }

        // Create inquiry if not duplicate
        if (!existingUniqueKeysFromInquiry.has(uniqueUserDefineId)) {
            const inquiryDescription = `${entry['Description']?.[0] || ''}\n\n#Id:${uniqueUserDefineId}`;
            inquiryMatches.push({
                contact_master_id: contactId,
                product_id: productId || -1,
                category_id: categoryId || -1,
                description: inquiryDescription,
                inquiry_date_time: formatDateTime,
                a_application_login_id,
                company_masters_id,
                source_type_id: sourceTypeId,
                qty: entry['required_quantity']?.[0] || "",
                static: entry['requirement_type']?.[0] === "One Time" ? 0 : 1,
                mobile_number: mobileNumber,
                unique_key: uniqueUserDefineId
            });
        }

        // Create message if unique
        if (!existingUniqueKeys.has(uniqueUserDefineId)) {
            const messageDescription = buildMessageDescription(entry);

            messageMatches.push({
                contact_masters_id: contactId,
                a_application_login_id,
                company_masters_id,
                description: messageDescription,
                created_date_time: formatDateTime,
                message_side: "2",
                message_type_id: "0",
                mobile_number: mobileNumber,
                unique_key: uniqueUserDefineId
            });
        }
    }

    return {
        processedContacts,
        inquiryMatches,
        messageMatches,
        whatsappEmailSendList,
        duplicateEntries
    };
}

/**
 * Resolve location IDs from maps
 */
function resolveLocationIds(entry, locationMaps) {
    let countryId = 0, stateId = 0, cityId = 0, areaId = 0;

    const countryName = entry['Country']?.[0];
    if (countryName) {
        const country = locationMaps.countryMap.get(countryName);
        if (country) {
            countryId = country.id;

            const stateName = entry['State']?.[0];
            if (stateName) {
                const state = locationMaps.stateMap.get(`${stateName}_${countryId}`);
                if (state) {
                    stateId = state.id;

                    const cityName = entry['City']?.[0];
                    if (cityName) {
                        const city = locationMaps.cityMap.get(`${cityName}_${stateId}`);
                        if (city) {
                            cityId = city.id;

                            const areaName = entry['Area']?.[0];
                            if (areaName) {
                                const area = locationMaps.areaMap.get(`${areaName}_${cityId}`);
                                if (area) areaId = area.id;
                            }
                        }
                    }
                }
            }
        }
    }

    return { countryId, stateId, cityId, areaId };
}

/**
 * Build contact object for insertion
 */
function buildContactObject(
    entry,
    assignedIds,
    formatDateTime,
    mobileNumber,
    gstNumber,
    sourceTypeId,
    locationIds,
    priceListId,
    labelId,
    a_application_login_id,
    company_masters_id,
    uniqueUserDefineId
) {
    const getFieldValue = (fieldName) => entry[fieldName]?.[0] || '';

    return {
        assinged_to_work_a_application_id: assignedIds,
        created_date_time: formatDateTime,
        person_name: entry['person_name']?.[0] || 'Unknown',
        mobile_number: mobileNumber,
        raw_mobile_number: entry['mobile_number']?.[0] || '',
        email_id: getFieldValue('Email'),
        pincode: getFieldValue('Pincode'),
        address: getFieldValue('Address'),
        a_application_login_id,
        company_masters_id,
        source_type_id: sourceTypeId,
        country: locationIds.countryId,
        state: locationIds.stateId,
        city: locationIds.cityId,
        area: locationIds.areaId,
        shipping_address: getFieldValue('shipping_address'),
        gst_number: gstNumber || "",
        assinged_to_price_list: priceListId || 0,
        company_name: getFieldValue('company_name'),
        lable: labelId || '',
        column_2: uniqueUserDefineId || '',
        referance_contact: getFieldValue('referance_contact'),
        // Custom fields
        cntc_column_number_1: getFieldValue('cntc_column_number_1'),
        cntc_column_number_2: getFieldValue('cntc_column_number_2'),
        cntc_column_number_3: getFieldValue('cntc_column_number_3'),
        cntc_column_number_4: getFieldValue('cntc_column_number_4'),
        cntc_column_number_5: getFieldValue('cntc_column_number_5'),
        cntc_column_text_1: getFieldValue('cntc_column_text_1'),
        cntc_column_text_2: getFieldValue('cntc_column_text_2'),
        cntc_column_text_3: getFieldValue('cntc_column_text_3'),
        cntc_column_text_4: getFieldValue('cntc_column_text_4'),
        cntc_column_text_5: getFieldValue('cntc_column_text_5'),
        cntc_column_text_area_1: getFieldValue('cntc_column_text_area_1'),
        cntc_column_text_area_2: getFieldValue('cntc_column_text_area_2'),
        cntc_column_text_area_3: getFieldValue('cntc_column_text_area_3'),
        cntc_column_text_area_4: getFieldValue('cntc_column_text_area_4'),
        cntc_column_text_area_5: getFieldValue('cntc_column_text_area_5'),
        cntc_column_date_1: getFieldValue('cntc_column_date_1'),
        cntc_column_date_2: getFieldValue('cntc_column_date_2'),
        cntc_column_date_3: getFieldValue('cntc_column_date_3'),
        cntc_column_date_4: getFieldValue('cntc_column_date_4'),
        cntc_column_date_5: getFieldValue('cntc_column_date_5'),
        cntc_column_date_and_time_1: getFieldValue('cntc_column_date_and_time_1'),
        cntc_column_date_and_time_2: getFieldValue('cntc_column_date_and_time_2'),
        cntc_column_date_and_time_3: getFieldValue('cntc_column_date_and_time_3'),
        cntc_column_date_and_time_4: getFieldValue('cntc_column_date_and_time_4'),
        cntc_column_date_and_time_5: getFieldValue('cntc_column_date_and_time_5'),
        cntc_column_time_1: getFieldValue('cntc_column_time_1'),
        cntc_column_time_2: getFieldValue('cntc_column_time_2'),
        cntc_column_time_3: getFieldValue('cntc_column_time_3'),
        cntc_column_time_4: getFieldValue('cntc_column_time_4'),
        cntc_column_time_5: getFieldValue('cntc_column_time_5'),
        cntc_column_switch_1: getFieldValue('cntc_column_switch_1'),
        cntc_column_switch_2: getFieldValue('cntc_column_switch_2'),
        cntc_column_switch_3: getFieldValue('cntc_column_switch_3'),
        cntc_column_switch_4: getFieldValue('cntc_column_switch_4'),
        cntc_column_switch_5: getFieldValue('cntc_column_switch_5'),
        cntc_column_decimal_1: getFieldValue('cntc_column_decimal_1'),
        cntc_column_decimal_2: getFieldValue('cntc_column_decimal_2'),
        cntc_column_decimal_3: getFieldValue('cntc_column_decimal_3'),
        cntc_column_dropdown_4: getFieldValue('cntc_column_dropdown_4'),
        cntc_column_dropdown_5: getFieldValue('cntc_column_dropdown_5'),
        cntc_column_radio_1: getFieldValue('cntc_column_radio_1'),
        cntc_column_radio_2: getFieldValue('cntc_column_radio_2'),
        cntc_column_radio_3: getFieldValue('cntc_column_radio_3'),
        cntc_column_radio_4: getFieldValue('cntc_column_radio_4'),
        cntc_column_radio_5: getFieldValue('cntc_column_radio_5'),
    };
}

/**
 * Build message description from all fields
 */
function buildMessageDescription(entry) {
    const expectedColumns = Object.keys(GOOGLE_SHEET_DECLARED_COLUMN_LIST);
    let description = "";

    expectedColumns.forEach((columnKey) => {
        const value = entry[columnKey]?.[0];
        const label = entry[columnKey]?.[1];

        if (isValid(value) && isValid(label)) {
            description += `<b>${label}:</b> ${formatDateTimeValue(value)}<br>`;
        }
    });

    return description;
}

/**
 * Get existing unique keys from message history
 */
async function getExistingUniqueKeys(req) {
    const CTContactMessageHistoryModel = contactMessageHistory(req.tenantDB);

    const messages = await CTContactMessageHistoryModel.findAll({
        where: {
            isDelete: 0,
            unique_key: { [Op.ne]: '' }
        },
        attributes: ["unique_key"],
        raw: true
    });

    return new Set(messages.map(m => m.unique_key));
}

/**
 * Get existing unique keys from message history
 */
async function getExistingUniqueKeysOfContact(req) {
    const contactModelInstance = contactModel(req.tenantDB);

    const contact = await contactModelInstance.findAll({
        where: {
            isDelete: 0,
            column_2: { [Op.ne]: '' }
        },
        attributes: ["column_2"],
        raw: true
    });

    return new Set(contact.map(m => m.column_2));
}

/**
 * Get existing unique keys from inquiry
 */
async function getExistingUniqueKeysFromInquiry(req) {
    const CTInquiryModel = inquiryModel(req.tenantDB);

    const inquiry = await CTInquiryModel.findAll({
        where: {
            isDelete: 0,
            unique_key: { [Op.ne]: '' }
        },
        attributes: ["unique_key"],
        raw: true
    });

    return new Set(inquiry.map(m => m.unique_key));
}

// ==================== POST-PROCESSING ====================

/**
 * Check user limits before bulk insertion
 */
async function checkUserLimits(req, company_masters_id, contactsToAdd) {
    const CTContactModelModel = contactModel(req.tenantDB);
    const applicationLoginTypeRightModelInstance = applicationLoginTypeRightModel(req.tenantDB);

    const [userList, userRightsList] = await Promise.all([
        CTContactModelModel.findAll({
            where: {
                company_masters_id,
                isDelete: 0,
            },
            attributes: ["id"],
            raw: true
        }),
        applicationLoginTypeRightModelInstance.findAll({
            where: {
                company_masters_id,
                page_id: 1,
                isDelete: 0,
            },
            attributes: ["a_application_login_id", "a_page_id_rights_jason"],
            raw: true
        })
    ]);

    const currentCount = userList.length;
    const totalAfterImport = currentCount + contactsToAdd;

    for (const userRight of userRightsList) {
        const rightsJson = safeJsonParse(userRight.a_page_id_rights_jason);

        if (rightsJson && typeof rightsJson.limit === "number" && rightsJson.limit > 0) {
            if (totalAfterImport > rightsJson.limit) {
                throw new Error(
                    `Limit ${rightsJson.limit} reached. Current: ${currentCount}, Trying to add: ${contactsToAdd}`
                );
            }
        }
    }

    return true;
}

/**
 * Handle post-creation tasks (logs, emails, WhatsApp)
 */
async function handlePostCreationTasks(
    req,
    createdContacts,
    whatsappEmailSendList,
    companyName,
    companyId,
    a_application_login_id
) {
    const contactEmailSendList = [];
    const contactWhatsappSendList = [];

    const statusLogPromises = createdContacts.map(contact => {
        // Create status log
        const logPromise = insertStagesAndStatusLogs(req, {
            reference_table: "contact_masters",
            reference_id: contact.id,
            status_id: "-1",
            a_application_login_id
        });

        // Prepare email notification
        if (isValid(contact.email_id)) {
            const assignment = whatsappEmailSendList.find(
                item => item.team_id === contact.assinged_to_work_a_application_id
            );

            if (assignment) {
                contactEmailSendList.push({
                    email_id: contact.email_id,
                    contact_detail: {
                        person_name: contact.person_name,
                        mobile_number: contact.mobile_number,
                        company_name: contact.company_name
                    },
                    team_person: contact.assinged_to_work_a_application_id,
                    company_name: companyName,
                    a_company_id: companyId,
                    send_message: assignment.send_message,
                });
            }
        }

        // Prepare WhatsApp notification
        if (isValid(contact.mobile_number)) {
            const assignment = whatsappEmailSendList.find(
                item => item.team_id === contact.assinged_to_work_a_application_id
            );

            if (assignment) {
                contactWhatsappSendList.push({
                    whatsapp_number: contact.mobile_number,
                    contact_detail: {
                        person_name: contact.person_name,
                        mobile_number: contact.mobile_number,
                        company_name: contact.company_name,
                        customer_id: contact.id
                    },
                    team_person: contact.assinged_to_work_a_application_id,
                    company_name: companyName,
                    a_company_id: companyId,
                    send_message: assignment.send_message,
                    template_id: result?.template_id,
                });
            }
        }

        return logPromise;
    });

    await Promise.all(statusLogPromises);

    // Send notifications
    if (contactEmailSendList.length > 0 || contactWhatsappSendList.length > 0) {
        await prepareMailAndWhatsappSenderToTheContact(req, {
            contactWhatsappSendList,
            contactEmailSendList
        });
    }
}

/**
 * Update contact read status for new messages
 */
async function markContactsAsUnread(req, contactIds) {
    if (!contactIds || contactIds.length === 0) return;

    const CTContactModelModel = contactModel(req.tenantDB);

    await CTContactModelModel.update(
        { is_read_by_a_application_login_id: "" },
        {
            where: {
                id: { [Sequelize.Op.in]: contactIds }
            }
        }
    );
}

// ==================== MAIN FUNCTION ====================

/**
 * Main function to add contacts from Google Sheets
 */
export const addContactByGoogleSheetForFacebook = async (req) => {
    try {
        // Validate request
        const { a_application_login_id } = req.body;
        if (!a_application_login_id) {
            return resError({
                developer_msg: "Missing a_application_login_id",
            });
        }

        // Get company info
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        if (findCompanyId.company_flag !== 1) {
            return resError({
                developer_msg: "You are not a company owner",
            });
        }

        const { company_masters_id } = findCompanyId;

        // Initialize models
        const CTSourceTypeModel = sourceTypesModel(req.tenantDB);
        const CTContactModelModel = contactModel(req.tenantDB);
        const CTInquiryModel = inquiryModel(req.tenantDB);
        const CTContactMessageHistoryModel = contactMessageHistory(req.tenantDB);
        const CTWorkFlowAutomationsModel = workflowAutomationsModel(req.tenantDB);

        // Get Google Sheet configuration
        const findGoogleSheetKey = await companyModel.findOne({
            where: {
                isDelete: "0",
                id: company_masters_id,
            },
            attributes: [
                "id",
                "company_name",
                "google_lead_sheet_for_faceBook_1",
                "google_sheet_key_3",
                "google_lead_sheet_for_faceBook_2",
                "google_sheet_key_4",
                "google_sheet_first_name",
                "google_sheet_second_name",
                "google_sheet_third_name",
                "google_sheet_fourth_name",
            ],
        });

        if (!findGoogleSheetKey) {
            return resError({
                developer_msg: "No Google Sheet keys found",
            });
        }

        const companyName = findGoogleSheetKey.company_name;
        const companyId = findGoogleSheetKey.id;

        // Build lookup maps
        const lookupMaps = await buildLookupMaps(req, a_application_login_id, company_masters_id);

        // Configure Google Sheets to fetch
        const googleSheetsConfig = {
            google_lead_sheet_for_faceBook_1: [
                findGoogleSheetKey.google_lead_sheet_for_faceBook_1,
                WORKFLOW_AUTOMATIONS_TYPES.google_lead_sheet_for_faceBook_1,
                lookupMaps.sourceTypeReverseMap.get(-2),
                findGoogleSheetKey.google_sheet_first_name
            ],
            google_lead_sheet_for_faceBook_2: [
                findGoogleSheetKey.google_lead_sheet_for_faceBook_2,
                WORKFLOW_AUTOMATIONS_TYPES.google_lead_sheet_for_faceBook_2,
                lookupMaps.sourceTypeReverseMap.get(-15),
                findGoogleSheetKey.google_sheet_second_name
            ],
            google_sheet_key_3: [
                findGoogleSheetKey.google_sheet_key_3,
                WORKFLOW_AUTOMATIONS_TYPES.google_sheet_key_3,
                lookupMaps.sourceTypeReverseMap.get(-5),
                findGoogleSheetKey.google_sheet_third_name
            ],
            google_sheet_key_4: [
                findGoogleSheetKey.google_sheet_key_4,
                WORKFLOW_AUTOMATIONS_TYPES.google_sheet_key_4,
                lookupMaps.sourceTypeReverseMap.get(-16),
                findGoogleSheetKey.google_sheet_fourth_name
            ],
        };

        // Filter out empty sheet IDs
        const validSheetsConfig = Object.fromEntries(
            Object.entries(googleSheetsConfig).filter(
                ([key, [spreadsheetId]]) => spreadsheetId && spreadsheetId.trim()
            )
        );

        if (Object.keys(validSheetsConfig).length === 0) {
            return resError({
                developer_msg: "No valid Google Sheet IDs configured",
            });
        }

        // Load Google credentials
        let credentials;
        try {
            credentials = loadGoogleCredentials();
        } catch (error) {
            return resError({
                ack_msg: "Configuration error",
                developer_msg: error.message,
            });
        }

        // Setup Google Sheets API
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: SCOPES,
        });

        const sheets = google.sheets({ version: "v4", auth });

        // Fetch data from all sheets
        let googleSheetDataArray;
        try {
            googleSheetDataArray = await fetchAllSheetsData(
                validSheetsConfig,
                sheets,
                CTWorkFlowAutomationsModel
            );
        } catch (error) {
            return resBadRequest({
                developer_msg: error.message,
            });
        }

        if (!googleSheetDataArray || googleSheetDataArray.length === 0) {
            return resError({
                ack_msg: "No data found",
                developer_msg: "No data found in Google Sheets",
            });
        }

        // Get last contact ID for number generation
        const lastContact = await CTContactModelModel.findOne({
            where: { isDelete: 0 },
            order: [['id', 'DESC']],
            attributes: ['id'],
            raw: true
        });

        // Validate and normalize data
        const { filteredData, duplicateEntries, invalidEntries } = validateAndNormalizeData(
            googleSheetDataArray,
            lastContact?.id || 0
        );

        if (invalidEntries.length > 0) {
            return resError({
                ack_msg: "Validation errors",
                developer_msg: invalidEntries.join(", "),
            });
        }

        if (filteredData.length === 0) {
            return resError({
                ack_msg: "No valid data to import",
                developer_msg: `All entries were duplicates or invalid`,
            });
        }

        // Sync campaigns
        const { campaignMap } = await syncCampaigns(
            filteredData,
            CTSourceTypeModel,
            a_application_login_id,
            company_masters_id
        );

        // Batch check existing contacts
        const mobileNumbers = filteredData.map(e => normalizeToTenDigit(e['mobile_number']?.[0]));
        const gstNumbers = filteredData.map(e => e['gst_number']?.[0]?.trim()).filter(Boolean);

        const existingContacts = await batchCheckExistingContacts(
            mobileNumbers,
            gstNumbers,
            CTContactModelModel,
            a_application_login_id,
            company_masters_id
        );

        // Batch fetch location data
        const locationMaps = await batchFetchLocationIds(filteredData, req);

        // Process contacts
        const {
            processedContacts,
            inquiryMatches,
            messageMatches,
            whatsappEmailSendList,
            duplicateEntries: processingDuplicates
        } = await processContactsForInsertion(
            filteredData,
            lookupMaps,
            campaignMap,
            existingContacts,
            locationMaps,
            req,
            a_application_login_id,
            company_masters_id
        );

        // Combine all duplicates
        const allDuplicates = [...new Set([...duplicateEntries, ...processingDuplicates])];

        // Check limits before insertion
        if (processedContacts.length > 0) {
            try {
                await checkUserLimits(req, company_masters_id, processedContacts.length);
            } catch (error) {
                return resError({
                    ack_msg: "Limit exceeded",
                    developer_msg: error.message,
                });
            }
        }

        // Bulk insert contacts
        let createdContacts = [];
        if (processedContacts.length > 0) {
            createdContacts = await CTContactModelModel.bulkCreate(
                processedContacts,
                { returning: true }
            );

            // Post-creation tasks
            await handlePostCreationTasks(
                req,
                createdContacts,
                whatsappEmailSendList,
                companyName,
                companyId,
                a_application_login_id
            );

            // Map contact IDs
            const contactIdMap = createdContacts.reduce((map, contact) => {
                map[contact.mobile_number] = contact.id;
                return map;
            }, {});

            // Update inquiry and message references
            inquiryMatches.forEach(inquiry => {
                inquiry.contact_master_id = inquiry.contact_master_id || contactIdMap[inquiry.mobile_number];
            });

            messageMatches.forEach(message => {
                message.contact_masters_id = message.contact_masters_id || contactIdMap[message.mobile_number];
            });
        }

        // Bulk insert inquiries
        if (inquiryMatches.length > 0) {
            const createdInquiries = await CTInquiryModel.bulkCreate(inquiryMatches);

            await Promise.all(
                createdInquiries.map(inquiry =>
                    insertStagesAndStatusLogs(req, {
                        reference_table: "inquiries",
                        reference_id: inquiry.id,
                        status_id: "-2",
                        a_application_login_id
                    })
                )
            );
        }

        // Bulk insert messages
        if (messageMatches.length > 0) {
            await CTContactMessageHistoryModel.bulkCreate(messageMatches);

            // Mark contacts as unread
            const contactIds = [...new Set(messageMatches.map(m => m.contact_masters_id).filter(Boolean))];
            await markContactsAsUnread(req, contactIds);
        }

        // Return success response
        if (createdContacts.length > 0) {
            return resSuccess({
                ack_msg: `Contact Added: ${createdContacts.length}, Inquires Added: ${inquiryMatches.length}, Messages Added: ${messageMatches.length}`,
                data: {
                    contacts_added: createdContacts.length,
                    inquiries_added: inquiryMatches.length,
                    messages_added: messageMatches.length,
                    duplicates: allDuplicates.length > 0 ? allDuplicates.join(", ") : "None"
                },
            });
        }

        return resError({
            ack_msg: "No new contacts added",
            developer_msg: "All contacts already exist in the system",
        });

    } catch (error) {
        console.error("addContactByGoogleSheetForFacebook error:", error);
        return resError({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

// ==================== UPDATE COLUMNS FUNCTION ====================

/**
 * Update Google Sheets column mappings
 */
export const updateGoogleSheetsColumnsData = async (req, res) => {
    try {
        const { columnsObject, a_application_login_id, type } = req.body;

        if (!columnsObject || !type) {
            return resBadRequest({
                developer_msg: "Missing required parameters: columnsObject or type",
            });
        }

        const workflowAutomations = workflowAutomationsModel(req.tenantDB);

        const [updateCount] = await workflowAutomations.update(
            { raw_values: JSON.stringify(columnsObject) },
            { where: { type, isDelete: '0' } }
        );

        if (updateCount > 0) {
            return resSuccess({
                ack_msg: "Google Sheets columns updated successfully",
            });
        } else {
            return resError({
                developer_msg: "No workflow automation found to update",
            });
        }
    } catch (error) {
        console.error("updateGoogleSheetsColumnsData error:", error);
        return resBadRequest({
            ack_msg: "Update failed",
            developer_msg: error.message,
        });
    }
};


export const getGoogleSheetsColumnsData = async (req, res) => {
    try {
        const googleSheetsColumns = { ...GOOGLE_SHEET_DECLARED_COLUMN_LIST };
        const { type, a_application_login_id } = req.body;
        sequelize.models.workflowAutomationsModel = workflowAutomationsModel(req.tenantDB);
        sequelize.models.customFieldFormModel = customFieldFormModel(req.tenantDB);
        const googleSheetsJsonStrings = await sequelize.models.workflowAutomationsModel.findOne({
            where: {
                type: type,
                isDelete: 0,
            },
            attributes: ["raw_values"],
            raw: true
        });
        const googleSheetsJsonObject = JSON.parse(googleSheetsJsonStrings.raw_values);

        function mergeAndReorder(defaultColumns, updatedMapping, customFormFieldArray) {
            const result = {};

            // Step 1: Add matched keys from updatedMapping first (in order)
            Object.keys(updatedMapping).forEach(key => {

                let default_column = key;
                let custom_column = key;
                const isMatched = customFormFieldArray.find(value => value.reference_column_name == default_column);
                custom_column = isValid(isMatched) ? isMatched.title : default_column;
                default_column = isValid(isMatched) ? isMatched.reference_column_name : default_column;

                if (defaultColumns.hasOwnProperty(custom_column)) {
                    result[custom_column] = [updatedMapping[default_column], defaultColumns[custom_column][1], default_column]; // Overwrite with new value
                }

            });


            // Step 2: Add remaining keys from defaultColumns that weren't in updatedMapping
            Object.keys(defaultColumns).forEach(key => {

                let default_column = key;
                let custom_column = key;

                const isMatched = customFormFieldArray.find(value => value.title == default_column);
                custom_column = isValid(isMatched) ? isMatched.title : default_column;
                default_column = isValid(isMatched) ? isMatched.reference_column_name : default_column;

                if (!updatedMapping.hasOwnProperty(default_column)) {
                    result[custom_column] = ['', defaultColumns[custom_column][1], default_column]; // Keep original value
                }
            });

            return result;
        }


        const customerColumndFields = Object.keys(Object.fromEntries(Object.entries(GOOGLE_SHEET_DECLARED_COLUMN_LIST).filter(([key, value]) => value[1]?.IS_CUSTOM_COLUMN === 1)));
        const getDatafromCustomFormFields = await sequelize.models.customFieldFormModel.findAll(
            {
                where: {
                    isDelete: '0',
                    reference_column_name: customerColumndFields
                },
                attributes: ['title', 'reference_column_name']
            }
        );

        /* customer form field rename */
        let deleteTitles = [];
        getDatafromCustomFormFields.map((title) => {
            deleteTitles.push(title.reference_column_name)
            googleSheetsColumns[title.title] = googleSheetsColumns[title.reference_column_name];
            googleSheetsColumns[title.title][0] = title.title;
            delete googleSheetsColumns[title.reference_column_name];
        });


        /* delete not assied custom form field */
        customerColumndFields.map((key) => {
            if (!deleteTitles.includes(key)) {
                delete googleSheetsColumns[key]
            }
        })

        const finalObject = mergeAndReorder(googleSheetsColumns, googleSheetsJsonObject, getDatafromCustomFormFields);

        if (googleSheetsJsonStrings) {
            return resSuccess({
                data: finalObject,
                message: "Data Fetch Successfully",
            });
        } else {
            return resError({
                ack_msg: "something  went wrong",
                developer_msg: "No Google Sheet Column Found.",
            });
        }
    } catch (error) {
        console.log("google sheet getGoogleSheetsColumnsData", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }

};