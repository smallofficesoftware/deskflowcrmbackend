import assert from "node:assert/strict";
import { buildContactUpdate, compactRows, convertCustomValue, dropUnchangedCells, formatRowMessages, parseUpdateSheet } from "./contactUpdateRules.js";

// ---------------- parseUpdateSheet
assert.deepEqual(parseUpdateSheet([]), { error: "No Data found in current sheet." });
assert.deepEqual(parseUpdateSheet([["contact_id"]]), { error: "No Data found in current sheet." });
assert.match(parseUpdateSheet([["person_name"], ["A"]]).error, /Missing mandatory fields : contact_id/);

const parsed = parseUpdateSheet(
    [
        ["contact_id", "person_name", "mobile_number", "Email", "City", " Notes "],
        [10, " Asha ", "9999999999", "", "Rajkot", "x"],
        [],
        ["", "No Id", "", "", "", ""],
        ["abc", "Bad Id", "", "", "", ""],
        [11, "", "8888888888", "b@c.in", "", "vip"],
    ],
    { Notes: "contact_column_text_1" },
);
assert.equal(parsed.rows.length, 4); // the fully empty row is skipped
assert.deepEqual(parsed.rows[0], { rowNumber: 2, contactId: 10, cells: { person_name: "Asha", City: "Rajkot", Notes: "x" } }); // blank Email left out, mobile_number ignored, header trimmed
assert.equal(parsed.rows[1].contactId, 0); // blank id
assert.equal(parsed.rows[2].contactId, 0); // not a number
assert.deepEqual(parsed.rows[3], { rowNumber: 6, contactId: 11, cells: { Email: "b@c.in", Notes: "vip" } }); // blank name = unchanged

// ---------------- convertCustomValue
assert.deepEqual(convertCustomValue("12", 1), { ok: true, value: 12 });
assert.deepEqual(convertCustomValue("x", 1), { ok: false });
assert.deepEqual(convertCustomValue("3.5", 8), { ok: true, value: 3.5 });
assert.deepEqual(convertCustomValue("Yes", 7), { ok: true, value: "1" });
assert.deepEqual(convertCustomValue("no", 7), { ok: true, value: "2" });
assert.deepEqual(convertCustomValue("  hello ", 2), { ok: true, value: "hello" });
assert.deepEqual(convertCustomValue("Gold", 9, { gold: "Gold", silver: "Silver" }), { ok: true, value: "Gold" });
assert.deepEqual(convertCustomValue("Bronze", 10, { gold: "Gold" }), { ok: false });
assert.deepEqual(convertCustomValue("Gold", 9, null), { ok: false });
assert.deepEqual(convertCustomValue("2026-10-02", 4), { ok: true, value: "2026-10-02" });
assert.deepEqual(convertCustomValue("02-10-2026", 4), { ok: true, value: "2026-10-02" });
assert.deepEqual(convertCustomValue(46297, 4), { ok: true, value: "2026-10-02" }); // Excel serial
assert.deepEqual(convertCustomValue("not a date", 4), { ok: false });
assert.deepEqual(convertCustomValue("14:30", 6), { ok: true, value: "14:30:00" });

// ---------------- buildContactUpdate
const lookups = {
    countries: [{ id: 1, name: "India" }, { id: 2, name: "USA" }],
    states: [{ id: 10, name: "Gujarat", country_id: 1 }, { id: 11, name: "Texas", country_id: 2 }],
    cities: [{ id: 100, name: "Rajkot", state_id: 10 }, { id: 101, name: "Surat", state_id: 10 }, { id: 102, name: "Austin", state_id: 11 }],
    areas: [{ id: 1000, name: "Kalawad Road", city_id: 100 }],
    priceLists: new Map([["retail", 7]]),
    sources: new Map([["google map", 3]]),
    labels: new Map([["customer", 1], ["vip", 2]]),
};
const existing = { country: 1, state: 10, city: 100, area: 1000 };
const customFields = {
    Tier: { column: "contact_column_dropdown_1", rule: 9, dataSource: { gold: "Gold" } },
    Score: { column: "contact_column_number_1", rule: 1, dataSource: null },
};
const build = (cells) => buildContactUpdate({ cells, existing, lookups, customFields });

// plain text fields
assert.deepEqual(build({ person_name: " Asha ", Email: "a@b.in", Pincode: "360005" }), {
    update: { person_name: "Asha", email_id: "a@b.in", pincode: "360005" },
    errors: [],
});
assert.deepEqual(build({}), { update: {}, errors: [] }); // nothing to change
assert.equal(build({ Email: "not-an-email" }).errors[0].key, "invalid_email");
assert.equal(build({ Email: "not-an-email" }).update.email_id, undefined);

// location: a lower level alone is looked up under the contact's current higher levels
assert.deepEqual(build({ City: "Surat" }).update, { city: 101, area: 0 }); // the old Area (Rajkot's) no longer fits
assert.deepEqual(build({ City: "surat" }).update, { city: 101, area: 0 }); // case-insensitive
assert.deepEqual(build({ Area: "Kalawad Road" }).update, {}); // same Area as the contact has: nothing to change
assert.deepEqual(build({ City: "Rajkot" }).update, {}); // same City: nothing to change
// unknown names
assert.equal(build({ Country: "Mars" }).errors[0].key, "country");
assert.equal(build({ State: "Nowhere" }).errors[0].key, "state");
assert.equal(build({ State: "Texas" }).errors[0].key, "state"); // Texas is not in the contact's country (India)
assert.equal(build({ City: "Austin" }).errors[0].key, "city"); // Austin is not in the contact's state (Gujarat)
assert.equal(build({ Area: "Elsewhere" }).errors[0].key, "area");
assert.deepEqual(build({ Country: "Mars", City: "Surat" }).update, {}); // an error means no update for the row
// a whole new location in one row; the old Area is cleared because it was not given
assert.deepEqual(build({ Country: "USA", State: "Texas", City: "Austin" }).update, { country: 2, state: 11, city: 102, area: 0 });
// moving the country alone clears the state, city and area that no longer fit
assert.deepEqual(build({ Country: "USA" }).update, { country: 2, state: 0, city: 0, area: 0 });
// same country again: nothing changes
assert.deepEqual(build({ Country: "India" }).update, {});
// a state that fits the new country is kept when only the country is the same family... and an unrelated level is untouched
assert.deepEqual(build({ State: "Gujarat" }).update, {});
// a contact with no location at all can get one
const bare = (cells) => buildContactUpdate({ cells, existing: {}, lookups, customFields });
assert.deepEqual(bare({ Country: "India", State: "Gujarat", City: "Rajkot", Area: "Kalawad Road" }).update, { country: 1, state: 10, city: 100, area: 1000 });
// ... and a lower level alone fills the levels above it from the match
assert.deepEqual(bare({ City: "Rajkot" }).update, { country: 1, state: 10, city: 100 });
assert.deepEqual(bare({ Area: "Kalawad Road" }).update, { country: 1, state: 10, city: 100, area: 1000 });
assert.deepEqual(bare({ State: "Texas" }).update, { country: 2, state: 11 });
// legacy contact: city set but state never saved - changing only the Area keeps the city and fills the missing state from it
const legacy = buildContactUpdate({ cells: { Area: "Kalawad Road" }, existing: { country: 1, state: 0, city: 100, area: 0 }, lookups, customFields });
assert.deepEqual(legacy.update, { state: 10, area: 1000 });

// other lookups
assert.deepEqual(build({ price_list: "Retail", source_type: "Google Map" }).update, { assinged_to_price_list: 7, source_type_id: 3 });
assert.equal(build({ price_list: "Wholesale" }).errors[0].key, "price_list");
assert.equal(build({ source_type: "TV" }).errors[0].key, "source_type");
assert.deepEqual(build({ label: "Customer, VIP" }).update, { lable: "1,2" });
assert.deepEqual(build({ label: "VIP,vip" }).update, { lable: "2" }); // duplicates collapse
const badLabel = build({ label: "VIP, Ghost, Phantom" });
assert.equal(badLabel.errors[0].text, "Label not found: Ghost, Phantom.");
assert.equal(badLabel.update.lable, undefined);

// custom fields
assert.deepEqual(build({ Tier: "Gold", Score: 5 }).update, { contact_column_dropdown_1: "Gold", contact_column_number_1: 5 });
assert.equal(build({ Tier: "Bronze" }).errors[0].text, 'Invalid value for "Tier".');
assert.equal(build({ Score: "abc" }).errors[0].key, "custom_contact_column_number_1");

// several problems are all reported
assert.equal(build({ Email: "x", price_list: "Nope", source_type: "Nope" }).errors.length, 3);

// ---------------- compactRows / formatRowMessages
assert.equal(compactRows([2, 3, 4, 5, 9]), "2-5, 9");
assert.equal(compactRows([5]), "5");
assert.equal(compactRows([5, 6]), "5, 6"); // two in a row stay as they are
assert.equal(compactRows([3, 1, 2, 2, 8, 10, 11, 12]), "1-3, 8, 10-12"); // unsorted and duplicated input
assert.equal(compactRows([]), "");

assert.equal(
    formatRowMessages([{ rowNumber: 3, errors: [{ text: "Contact ID not found." }] }, { rowNumber: 5, errors: [{ text: "Invalid Email." }, { text: "Price list not found." }] }]),
    "Row Number <b>3</b> : Contact ID not found.<br/>Row Number <b>5</b> : Invalid Email.<br/>Row Number <b>5</b> : Price list not found.<br/>",
);
assert.equal(formatRowMessages([]), "");
// the same problem on many rows is one line
const many = Array.from({ length: 114 }, (_, i) => ({ rowNumber: i + 2, errors: [{ text: "Contact ID not found." }] }));
assert.equal(formatRowMessages(many), "Rows <b>2-115</b> : Contact ID not found.<br/>");
assert.equal(
    formatRowMessages([
        { rowNumber: 4, errors: [{ text: "Invalid Email." }] },
        { rowNumber: 6, errors: [{ text: "Contact ID not found." }] },
        { rowNumber: 7, errors: [{ text: "Invalid Email." }] },
    ]),
    "Rows <b>4, 7</b> : Invalid Email.<br/>Row Number <b>6</b> : Contact ID not found.<br/>",
);

// ---------------- dropUnchangedCells
const current = { person_name: "Asha", Email: "a@b.in", City: "Rajkot", label: "Customer, VIP", Score: 5, Pincode: "360005" };
assert.deepEqual(dropUnchangedCells({ person_name: "Asha", Email: "a@b.in", City: "Rajkot", label: "Customer, VIP", Score: 5, Pincode: 360005 }, current), {}); // nothing changed (numbers compare as text)
assert.deepEqual(dropUnchangedCells({ person_name: "Asha K", Email: "a@b.in" }, current), { person_name: "Asha K" });
assert.deepEqual(dropUnchangedCells({ City: "rajkot", person_name: " ASHA " }, current), {}); // case and spaces do not count as a change
assert.deepEqual(dropUnchangedCells({ label: "VIP,customer" }, current), {}); // same labels in another order
assert.deepEqual(dropUnchangedCells({ label: "VIP" }, current), { label: "VIP" }); // a label removed
assert.deepEqual(dropUnchangedCells({ label: "Customer, VIP, Hot" }, current), { label: "Customer, VIP, Hot" }); // a label added
assert.deepEqual(dropUnchangedCells({ City: "Surat" }, {}), { City: "Surat" }); // contact had no value
assert.deepEqual(dropUnchangedCells({ City: "Surat" }, undefined), { City: "Surat" });

console.log("contactUpdateRules tests passed");
