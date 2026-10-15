// Update contacts by Excel - same flow as the product update sheet:
//   1. generateContactUpdateSheet: an .xlsx of the contacts the user can see (with contact_id)
//   2. updateContactsByExcelSheet: the edited sheet comes back; every row is checked, valid rows
//      update their contact (matched by contact_id), invalid rows are listed with the reason.
// Row rules live in contactUpdateRules.js. An empty cell leaves a field unchanged; mobile_number
// is shown but never updated.
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import XLSX from "xlsx";
import { contactModel } from "../../models/activities/contactModel.js";
import { areaModel } from "../../models/masters/areaModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { countryModel } from "../../models/masters/countryModel.js";
import { labelModel } from "../../models/masters/labelModel.js";
import { sourceTypesModel } from "../../models/masters/sourceTypeMode.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { customFieldDatavaluesModel } from "../../models/other_settings/customfieldDatavaluesModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { priceListMastersModel } from "../../models/product_settings/priceListMastersModel.js";
import { EXPORTS_LINK_EXTENDED } from "../../utils/appConstants.js";
import { exportData } from "../../utils/exporter.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { buildContactWhereClause } from "../activities/contactService.js";
import {
    buildContactUpdate,
    dropUnchangedCells,
    ERROR_TEXT,
    formatRowMessages,
    parseUpdateSheet,
} from "./contactUpdateRules.js";
import { runInRequestCompany } from "./requestCompanyContext.js";

const CONTACT_FORM_TYPE = 1; // custom_field_form_masters.form_type for contacts

// Everything the sheet needs to turn names into ids (and ids back into names).
async function loadLookups(tenantDB) {
    const [countries, states, cities, areas, priceLists, sources, labels, customFieldRows] = await Promise.all([
        countryModel(tenantDB).findAll({ attributes: ["id", "country_name"], raw: true }),
        stateModel(tenantDB).findAll({ attributes: ["id", "state_name", "country_id"], raw: true }),
        cityModel(tenantDB).findAll({ attributes: ["id", "city_name", "state_id"], raw: true }),
        areaModel(tenantDB).findAll({ attributes: ["id", "area_name", "city_id"], raw: true }),
        priceListMastersModel(tenantDB).findAll({ where: { isDelete: 0 }, attributes: ["id", "price_list_name"], raw: true }),
        sourceTypesModel(tenantDB).findAll({ where: { isDelete: 0 }, attributes: ["id", "source_name"], raw: true }),
        labelModel(tenantDB).findAll({ where: { isDelete: 0 }, attributes: ["id", "lable_name"], raw: true }),
        customFieldFormModel(tenantDB).findAll({
            where: { form_type: CONTACT_FORM_TYPE, isDelete: 0 },
            attributes: ["id", "title", "reference_column_name", "data_type"],
            raw: true,
        }),
    ]);

    // dropdown / radio custom fields (types 9, 10): the allowed values
    const choiceFieldIds = customFieldRows.filter((f) => [9, 10].includes(Number(f.data_type))).map((f) => f.id);
    const choiceValues = choiceFieldIds.length
        ? await customFieldDatavaluesModel(tenantDB).findAll({
            where: { custom_field_master_id: { [Op.in]: choiceFieldIds }, isDelete: 0 },
            attributes: ["data_sorce", "custom_field_master_id"],
            raw: true,
        })
        : [];

    const customFields = {};
    for (const f of customFieldRows) {
        if (!f.title || !f.reference_column_name) continue;
        const dataSource = {};
        choiceValues
            .filter((v) => v.custom_field_master_id === f.id && v.data_sorce)
            .forEach((v) => { dataSource[String(v.data_sorce).trim().toLowerCase()] = v.data_sorce; });
        customFields[String(f.title).trim()] = {
            column: f.reference_column_name,
            rule: Number(f.data_type),
            dataSource: [9, 10].includes(Number(f.data_type)) ? dataSource : null,
        };
    }

    const lower = (v) => String(v ?? "").trim().toLowerCase();
    return {
        customFields,
        lookups: {
            countries: countries.map((c) => ({ id: c.id, name: c.country_name })),
            states: states.map((s) => ({ id: s.id, name: s.state_name, country_id: s.country_id })),
            cities: cities.map((c) => ({ id: c.id, name: c.city_name, state_id: c.state_id })),
            areas: areas.map((a) => ({ id: a.id, name: a.area_name, city_id: a.city_id })),
            priceLists: new Map(priceLists.map((p) => [lower(p.price_list_name), p.id])),
            sources: new Map(sources.map((s) => [lower(s.source_name), s.id])),
            labels: new Map(labels.map((l) => [lower(l.lable_name), l.id])),
        },
        names: {
            country: new Map(countries.map((c) => [c.id, c.country_name])),
            state: new Map(states.map((s) => [s.id, s.state_name])),
            city: new Map(cities.map((c) => [c.id, c.city_name])),
            area: new Map(areas.map((a) => [a.id, a.area_name])),
            priceList: new Map(priceLists.map((p) => [p.id, p.price_list_name])),
            source: new Map(sources.map((s) => [s.id, s.source_name])),
            label: new Map(labels.map((l) => [l.id, l.lable_name])),
        },
    };
}

// The contact_masters columns a sheet row is built from (and compared against on upload).
const CONTACT_SHEET_ATTRIBUTES = [
    "id", "person_name", "company_name", "mobile_number", "email_id", "client_code",
    "country", "state", "city", "area", "pincode", "address", "shipping_address", "gst_number",
    "assinged_to_price_list", "source_type_id", "lable",
];

// One contact as the downloaded sheet shows it. The upload compares the cells it gets with this,
// so a cell that still holds what the sheet showed is not a change (and is not validated).
function contactToSheetRow(c, names, customFields) {
    const row = {
        contact_id: c.id,
        person_name: c.person_name || "",
        company_name: c.company_name || "",
        mobile_number: c.mobile_number || "",
        Email: c.email_id || "",
        client_code: c.client_code || "",
        Country: names.country.get(c.country) || "",
        State: names.state.get(c.state) || "",
        City: names.city.get(c.city) || "",
        Area: names.area.get(c.area) || "",
        Pincode: c.pincode || "",
        Address: c.address || "",
        shipping_address: c.shipping_address || "",
        gst_number: c.gst_number || "",
        price_list: names.priceList.get(c.assinged_to_price_list) || "",
        source_type: names.source.get(c.source_type_id) || "",
        label: String(c.lable || "")
            .split(",")
            .map((id) => names.label.get(Number(id)))
            .filter(Boolean)
            .join(", "),
    };
    for (const [title, def] of Object.entries(customFields)) row[title] = c[def.column] ?? "";
    return row;
}

// ------------------------------------------------------------------ 1. download the sheet

const buildContactUpdateSheet = async (req) => {
    try {
        const { a_application_login_id } = req.body;
        const company = await getCompanyByLoginId(a_application_login_id);
        if (!company?.company_masters_id) {
            return resBadRequest({ ack_msg: "Invalid company ID", developer_msg: "No company for the login id" });
        }

        // Same visibility rule as the contact list (rights, archived, ...), no extra filters.
        const { whereClause } = await buildContactWhereClause({ req, params: { a_application_login_id } });
        const { customFields, names } = await loadLookups(req.tenantDB);

        const customColumns = Object.values(customFields).map((f) => f.column);
        const contacts = await contactModel(req.tenantDB).findAll({
            where: whereClause,
            attributes: [...CONTACT_SHEET_ATTRIBUTES, ...customColumns],
            order: [["id", "ASC"]],
            raw: true,
        });

        const customTitles = Object.keys(customFields);
        const columns = [
            "contact_id", "person_name", "company_name", "mobile_number", "Email", "client_code",
            "Country", "State", "City", "Area", "Pincode", "Address", "shipping_address", "gst_number",
            "price_list", "source_type", "label",
            ...customTitles,
        ];

        const rows = contacts.map((c) => contactToSheetRow(c, names, customFields));

        const uploadDir = path.resolve(process.cwd(), `media-folder/exports/contacts/${company.company_masters_id}`);
        fs.mkdirSync(uploadDir, { recursive: true });

        const saved = await exportData(rows, {
            format: "xlsx",
            fileName: `contacts_for_update_${randomUUID()}`,
            columns,
            autoDownload: false,
            outputDir: uploadDir,
        });
        if (!saved?.file_name) return resError({ ack_msg: "Failed to create the contact sheet." });

        return resSuccess({
            data: {
                fileUrl: `${EXPORTS_LINK_EXTENDED}contacts/${company.company_masters_id}/${saved.file_name}`,
                fileName: saved.file_name,
            },
        });
    } catch (error) {
        console.error("generateContactUpdateSheet error:", error);
        return resError({ ack_msg: "Failed to create the contact sheet.", developer_msg: `${error?.message || error}` });
    }
};

// ------------------------------------------------------------------ 2. upload the edited sheet

const applyContactUpdateSheet = async (req) => {
    try {
        if (!req.file) {
            return resBadRequest({ ack_msg: "No file uploaded", developer_msg: "Please upload an Excel file" });
        }
        const { a_application_login_id } = req.body;
        if (!a_application_login_id) {
            return resBadRequest({ ack_msg: "Missing authentication details", developer_msg: "a_application_login_id is required" });
        }
        const company = await getCompanyByLoginId(a_application_login_id);
        if (!company?.company_masters_id) {
            return resBadRequest({ ack_msg: "Invalid company ID", developer_msg: "No company for the login id" });
        }

        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const { lookups, customFields, names } = await loadLookups(req.tenantDB);
        const customHeaders = Object.fromEntries(Object.entries(customFields).map(([title, f]) => [title, f.column]));

        const parsed = parseUpdateSheet(data, customHeaders);
        if (parsed.error) return resError({ ack_msg: parsed.error, developer_msg: parsed.error });

        // Only contacts this user can see can be updated (same rule as the list and the download).
        const ids = [...new Set(parsed.rows.map((r) => r.contactId).filter(Boolean))];
        const { whereClause } = await buildContactWhereClause({ req, params: { a_application_login_id } });
        const customColumns = Object.values(customFields).map((f) => f.column);
        const existingRows = ids.length
            ? await contactModel(req.tenantDB).findAll({
                where: { [Op.and]: [whereClause, { id: { [Op.in]: ids } }] },
                attributes: [...CONTACT_SHEET_ATTRIBUTES, ...customColumns],
                raw: true,
            })
            : [];
        const existingById = new Map(existingRows.map((c) => [c.id, c]));

        // None of the sheet's contacts can be seen here: almost always a sheet downloaded in another
        // company / workspace, or a login without access to these contacts. One clear message
        // instead of a "not found" line for every row.
        if (ids.length && !existingRows.length) {
            return resError({
                ack_msg: "None of the contacts in this sheet were found in the company you are in. Download the sheet again from the company you want to update, and check that you have access to its contacts.",
                developer_msg: `${ids.length} contact ids, none visible to login ${a_application_login_id} in the active company`,
            });
        }

        const rowErrors = [];
        const updates = [];
        const seen = new Set();

        for (const row of parsed.rows) {
            const errors = [];
            if (!row.contactId) {
                errors.push({ key: "contact_id_blank", text: ERROR_TEXT.contact_id_blank });
            } else if (seen.has(row.contactId)) {
                errors.push({ key: "duplicate_id", text: ERROR_TEXT.duplicate_id });
            } else if (!existingById.has(row.contactId)) {
                errors.push({ key: "contact_not_found", text: ERROR_TEXT.contact_not_found });
            }
            if (row.contactId) seen.add(row.contactId);

            if (!errors.length) {
                const existing = existingById.get(row.contactId);
                // Cells that still hold what the downloaded sheet showed are not changes.
                const cells = dropUnchangedCells(row.cells, contactToSheetRow(existing, names, customFields));
                if (Object.keys(cells).length) {
                    const built = buildContactUpdate({ cells, existing, lookups, customFields });
                    errors.push(...built.errors);
                    if (!built.errors.length && Object.keys(built.update).length) {
                        updates.push({ id: row.contactId, update: built.update, rowNumber: row.rowNumber, name: existing.person_name });
                    }
                }
            }
            if (errors.length) rowErrors.push({ rowNumber: row.rowNumber, errors });
        }

        const responseMessage = formatRowMessages(rowErrors);

        if (!updates.length) {
            return resError({
                ack_msg: rowErrors.length ? "No valid data found." : "Nothing to update: every cell in the sheet is empty or unchanged.",
                developer_msg: rowErrors.length ? "All rows skipped." : "No changed cells",
                data: responseMessage || "",
            });
        }

        // All valid rows together: either every one of them updates or none does.
        await req.tenantDB.transaction(async (transaction) => {
            for (const { id, update } of updates) {
                await contactModel(req.tenantDB).update(update, {
                    where: { id, company_masters_id: company.company_masters_id, isDelete: 0 },
                    transaction,
                });
            }
        });

        // Name the updated contacts (first 15 only, so a big sheet does not flood the popup).
        const SHOWN = 15;
        const listed = updates.slice(0, SHOWN).map((u) => `${u.name || "-"} (ID ${u.id}, row ${u.rowNumber})`).join(", ");
        const more = updates.length > SHOWN ? ` and ${updates.length - SHOWN} more` : "";

        return resSuccess({
            ack_msg: `Successfully updated ${updates.length} contacts: ${listed}${more}.`,
            developer_msg: `Successfully updated ${updates.length} contacts.`,
            data: responseMessage || "",
        });
    } catch (error) {
        console.error("updateContactsByExcelSheet error:", error);
        return resError({ ack_msg: "Unexpected error occurred during excel import.", developer_msg: `${error?.message || error}` });
    }
};

// Entry points. Both run in the request's active company (see requestCompanyContext.js): the
// upload route loses it, and then the rights / company lookups used the wrong company.
export const generateContactUpdateSheet = (req) => runInRequestCompany(req, () => buildContactUpdateSheet(req));
export const updateContactsByExcelSheet = (req) => runInRequestCompany(req, () => applyContactUpdateSheet(req));
