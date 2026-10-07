// Rules for "update contacts by Excel" (same idea as the product update sheet).
//
//  - The sheet has one row per contact, matched by contact_id.
//  - Headers use the contact import's names (person_name, Email, Country, label, ...).
//  - An EMPTY cell leaves that field as it is; only cells with a value change the contact.
//  - mobile_number is shown in the sheet but never updated.
//  - Names in Country / State / City / Area / price_list / source_type / label are looked up
//    to ids; a name that does not exist makes that row invalid (the row is listed, the rest update).
//  - Changing Country / State / City clears a lower level (State / City / Area) that is not in the
//    sheet and no longer belongs under it.
//
// Everything here is pure (no database) so it can be tested; the service loads the lookups.
import moment from "moment";

export const CONTACT_ID_HEADER = "contact_id";
export const READ_ONLY_HEADERS = ["mobile_number"];

// header -> contact_masters column, copied as trimmed text
export const TEXT_HEADERS = {
    person_name: "person_name",
    company_name: "company_name",
    Email: "email_id",
    client_code: "client_code",
    Pincode: "pincode",
    Address: "address",
    shipping_address: "shipping_address",
    gst_number: "gst_number",
};

export const LOOKUP_HEADERS = ["Country", "State", "City", "Area", "price_list", "source_type", "label"];

export const ERROR_TEXT = {
    contact_id_blank: "Contact ID is blank.",
    contact_not_found: "Contact ID not found.",
    duplicate_id: "Contact ID appears more than once in the sheet.",
    invalid_email: "Invalid Email.",
    country: "Country not found.",
    state: "State not found for this Country.",
    city: "City not found for this State.",
    area: "Area not found for this City.",
    price_list: "Price list not found.",
    source_type: "Source type not found.",
    label: "Label not found.",
};

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";
const norm = (v) => String(v).trim().toLowerCase();

// ---------------------------------------------------------------- parsing

// data: sheet_to_json(sheet, { header: 1 }). customHeaders: { title: reference_column_name }.
// Returns { error } or { rows: [{ rowNumber, contactId, cells }] } where cells holds only
// the non-empty cells, by header.
export function parseUpdateSheet(data, customHeaders = {}) {
    if (!Array.isArray(data) || data.length <= 1) return { error: "No Data found in current sheet." };

    const headers = (data[0] || []).map((h) => (h === undefined || h === null ? "" : String(h).trim()));
    if (!headers.includes(CONTACT_ID_HEADER)) {
        return { error: `Missing mandatory fields : ${CONTACT_ID_HEADER}` };
    }

    const updatable = new Set([...Object.keys(TEXT_HEADERS), ...LOOKUP_HEADERS, ...Object.keys(customHeaders)]);
    const idIndex = headers.indexOf(CONTACT_ID_HEADER);

    const rows = [];
    for (let i = 1; i < data.length; i++) {
        const line = data[i] || [];
        if (line.every(isBlank)) continue; // fully empty row

        const cells = {};
        headers.forEach((header, col) => {
            if (!updatable.has(header) || isBlank(line[col])) return;
            cells[header] = typeof line[col] === "string" ? line[col].trim() : line[col];
        });

        const rawId = line[idIndex];
        const contactId = isBlank(rawId) ? 0 : Number(rawId);
        rows.push({ rowNumber: i + 1, contactId: Number.isInteger(contactId) && contactId > 0 ? contactId : 0, cells });
    }
    return { rows };
}

// ---------------------------------------------------------------- custom field values

// Excel stores dates as serial numbers (days since 1899-12-30).
const parseExcelDate = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return moment.utc(Math.round((value - 25569) * 86400 * 1000));
    }
    const parsed = moment(String(value).trim(), ["YYYY-MM-DD", "DD-MM-YYYY", "DD/MM/YYYY", "YYYY-MM-DD HH:mm:ss", "DD-MM-YYYY HH:mm", "HH:mm:ss", "HH:mm"], true);
    return parsed.isValid() ? parsed : null;
};

// Same rule numbers the imports use: 1 number, 2/3 text, 4 date, 5 date-time, 6 time,
// 7 switch, 8 decimal, 9/10 dropdown / radio (value must be in dataSource, keyed by lower-case text).
// Returns { ok: true, value } or { ok: false }.
export function convertCustomValue(value, rule, dataSource = null) {
    switch (Number(rule)) {
        case 1: {
            const n = Number(value);
            return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
        }
        case 8: {
            const n = parseFloat(value);
            return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
        }
        case 7:
            return { ok: true, value: ["1", "true", "yes"].includes(norm(value)) ? "1" : "2" };
        case 9:
        case 10: {
            const hit = dataSource ? dataSource[norm(value)] : undefined;
            return hit === undefined || hit === null ? { ok: false } : { ok: true, value: hit };
        }
        case 4:
        case 5:
        case 6: {
            const d = parseExcelDate(value);
            if (!d) return { ok: false };
            const format = Number(rule) === 4 ? "YYYY-MM-DD" : Number(rule) === 5 ? "YYYY-MM-DD HH:mm:ss" : "HH:mm:ss";
            return { ok: true, value: d.format(format) };
        }
        default:
            return { ok: true, value: String(value).trim() }; // text (2, 3) and anything unknown
    }
}

// ---------------------------------------------------------------- unchanged cells

const sameCell = (header, cell, current) => {
    if (header === "label") {
        const list = (v) => new Set(String(v ?? "").split(",").map((n) => norm(n)).filter(Boolean));
        const a = list(cell);
        const b = list(current);
        return a.size === b.size && [...a].every((n) => b.has(n));
    }
    return norm(cell) === norm(current ?? "");
};

// currentRow: the contact as the downloaded sheet shows it (same headers as the cells).
// A cell that still holds what the sheet showed is not a change: it is dropped, so an untouched
// (or partly edited) sheet only updates what really changed, and legacy values that would not
// pass today's checks (e.g. a state saved under a different country) are not re-validated.
export function dropUnchangedCells(cells, currentRow) {
    const changed = {};
    for (const [header, value] of Object.entries(cells)) {
        if (!sameCell(header, value, currentRow?.[header])) changed[header] = value;
    }
    return changed;
}

// ---------------------------------------------------------------- one row

// lookups: {
//   countries: [{id, name}], states: [{id, name, country_id}], cities: [{id, name, state_id}],
//   areas: [{id, name, city_id}], priceLists: Map(lower name -> id), sources: Map(lower name -> id),
//   labels: Map(lower name -> id)
// }
// customFields: { title: { column, rule, dataSource } }
// existing: the contact as stored (country, state, city, area ids).
// Returns { update, errors } - errors is a list of { key, text }; no update is meant to be applied when errors exist.
export function buildContactUpdate({ cells, existing = {}, lookups, customFields = {} }) {
    const update = {};
    const errors = [];
    const fail = (key, text) => errors.push({ key, text: text || ERROR_TEXT[key] });

    for (const [header, column] of Object.entries(TEXT_HEADERS)) {
        if (cells[header] === undefined) continue;
        const value = String(cells[header]).trim();
        if (header === "Email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            fail("invalid_email");
            continue;
        }
        update[column] = value;
    }

    // ---- location: names -> ids, top-down (Country > State > City > Area).
    // A level given in the sheet must exist under the level above it. A level NOT given in the
    // sheet is kept, unless the level above it changed and it no longer belongs there - then it
    // is cleared (0), like the contact form does when the City changes.
    const byName = (list, name, ok = () => true) => list.find((x) => norm(x.name) === norm(name) && ok(x));
    const locationErrors = [];

    let country = existing.country || 0;
    if (cells.Country !== undefined) {
        const hit = byName(lookups.countries, cells.Country);
        if (hit) country = hit.id; else locationErrors.push("country");
    }

    let state = existing.state || 0;
    if (cells.State !== undefined) {
        const hit = byName(lookups.states, cells.State, (s) => !country || s.country_id === country);
        if (hit) state = hit.id; else locationErrors.push("state");
    } else if (state && country !== (existing.country || 0)) {
        const row = lookups.states.find((s) => s.id === state);
        if (!row || row.country_id !== country) state = 0;
    }

    let city = existing.city || 0;
    if (cells.City !== undefined) {
        const hit = byName(lookups.cities, cells.City, (c) => !state || c.state_id === state);
        if (hit) city = hit.id; else locationErrors.push("city");
    } else if (city && state !== (existing.state || 0)) {
        const row = lookups.cities.find((c) => c.id === city);
        if (!row || row.state_id !== state) city = 0;
    }

    let area = existing.area || 0;
    if (cells.Area !== undefined) {
        const hit = byName(lookups.areas, cells.Area, (a) => !city || a.city_id === city);
        if (hit) area = hit.id; else locationErrors.push("area");
    } else if (area && city !== (existing.city || 0)) {
        const row = lookups.areas.find((a) => a.id === area);
        if (!row || row.city_id !== city) area = 0;
    }

    // A level given without the levels above it (e.g. only a City) fills them in from the match,
    // like the contact import does, so the contact is not left with a city but no state.
    if (cells.Area !== undefined && area && !city) {
        const row = lookups.areas.find((a) => a.id === area);
        if (row) city = row.city_id;
    }
    if ((cells.Area !== undefined || cells.City !== undefined) && city && !state) {
        const row = lookups.cities.find((c) => c.id === city);
        if (row) state = row.state_id;
    }
    if ((cells.Area !== undefined || cells.City !== undefined || cells.State !== undefined) && state && !country) {
        const row = lookups.states.find((s) => s.id === state);
        if (row) country = row.country_id;
    }

    locationErrors.forEach((key) => fail(key));
    if (!locationErrors.length) {
        if (country !== (existing.country || 0)) update.country = country;
        if (state !== (existing.state || 0)) update.state = state;
        if (city !== (existing.city || 0)) update.city = city;
        if (area !== (existing.area || 0)) update.area = area;
    }

    // ---- other lookups
    if (cells.price_list !== undefined) {
        const id = lookups.priceLists.get(norm(cells.price_list));
        if (id === undefined) fail("price_list"); else update.assinged_to_price_list = id;
    }
    if (cells.source_type !== undefined) {
        const id = lookups.sources.get(norm(cells.source_type));
        if (id === undefined) fail("source_type"); else update.source_type_id = id;
    }
    if (cells.label !== undefined) {
        const names = String(cells.label).split(",").map((n) => n.trim()).filter(Boolean);
        const ids = names.map((n) => lookups.labels.get(norm(n)));
        const missing = names.filter((_, i) => ids[i] === undefined);
        if (missing.length) fail("label", `Label not found: ${missing.join(", ")}.`);
        else update.lable = [...new Set(ids)].join(",");
    }

    // ---- custom fields
    for (const [title, def] of Object.entries(customFields)) {
        if (cells[title] === undefined) continue;
        const converted = convertCustomValue(cells[title], def.rule, def.dataSource);
        if (!converted.ok) fail(`custom_${def.column}`, `Invalid value for "${title}".`);
        else update[def.column] = converted.value;
    }

    return { update, errors };
}

// 2,3,4,5,9 -> "2-5, 9"
export function compactRows(rowNumbers) {
    const rows = [...new Set(rowNumbers)].sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < rows.length;) {
        let j = i;
        while (j + 1 < rows.length && rows[j + 1] === rows[j] + 1) j++;
        parts.push(j - i >= 2 ? `${rows[i]}-${rows[j]}` : rows.slice(i, j + 1).join(", "));
        i = j + 1;
    }
    return parts.join(", ");
}

// One line per problem, same shape as the product update's message ("Row Number <b>5</b> : text"),
// with the rows that share a problem grouped: "Rows <b>2-115</b> : Contact ID not found.".
export function formatRowMessages(rowErrors) {
    const byText = new Map();
    for (const { rowNumber, errors } of rowErrors) {
        for (const { text } of errors) {
            if (!byText.has(text)) byText.set(text, []);
            byText.get(text).push(rowNumber);
        }
    }
    return [...byText.entries()]
        .map(([text, rows]) => `${rows.length === 1 ? "Row Number" : "Rows"} <b>${compactRows(rows)}</b> : ${text}<br/>`)
        .join("");
}
