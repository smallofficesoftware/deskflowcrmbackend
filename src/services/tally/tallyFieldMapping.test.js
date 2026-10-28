// Dependency-free self-test for tallyFieldMapping.js. Runnable directly:
//
//   node src/services/tally/tallyFieldMapping.test.js
import assert from "assert";
import { buildUdfList, cleanUdfValue, isValidUdfName, normalizeUdfName } from "./tallyFieldMapping.js";

const cart = {
  cart_remark: "  Deliver before Friday ",
  to_customer_phone: "9876543210",
  to_customer_email: "",
  carts_column_text_1: "PO-4471",
  carts_column_number_2: 1500.5,
  carts_column_text_3: "",
  some_secret_column: "must never leak",
};
const customFields = new Map([
  [11, { id: 11, reference_column_name: "carts_column_text_1" }],
  [12, { id: 12, reference_column_name: "carts_column_number_2" }],
  [13, { id: 13, reference_column_name: "carts_column_text_3" }], // empty on this cart
  [14, { id: 14, reference_column_name: "some_secret_column" }], // not a custom slot
]);
const map = (source_type, source_ref, name) => ({ source_type, source_ref, external_field_name: name });

// names
assert.strictEqual(normalizeUdfName("  PO Number "), "PO_Number");
assert.strictEqual(normalizeUdfName("Order_Ref1"), "Order_Ref1");
assert.strictEqual(normalizeUdfName("1BadStart"), "");
assert.strictEqual(normalizeUdfName("Bad<Name>"), "");
assert.strictEqual(normalizeUdfName("a:b"), "");
assert.strictEqual(normalizeUdfName(""), "");
assert.strictEqual(isValidUdfName("x".repeat(80)), true);
assert.strictEqual(isValidUdfName("x".repeat(81)), false);

// values
assert.strictEqual(cleanUdfValue("  hi\u0000 there\u0007 "), "hi there");
assert.strictEqual(cleanUdfValue("x".repeat(400)).length, 250);
assert.strictEqual(cleanUdfValue(null), "");

// building
const udfs = buildUdfList(
  [
    map("custom_field", "11", "PO Number"),
    map("custom_field", "12", "Advance"),
    map("column", "cart_remark", "Remarks"),
    map("column", "to_customer_phone", "Phone"),
    map("column", "to_customer_email", "Email"), // empty -> skipped
    map("custom_field", "13", "Empty"), // empty -> skipped
    map("custom_field", "14", "Secret"), // not a custom slot -> skipped
    map("column", "some_secret_column", "Secret2"), // not an allowed standard column -> skipped
    map("custom_field", "99", "Gone"), // field deleted -> skipped
    map("column", "cart_remark", "Remarks"), // same UDF twice -> first wins
    map("column", "Address", "<script>"), // invalid tag name -> skipped
  ],
  customFields,
  cart
);
assert.deepStrictEqual(udfs, [
  { name: "PO_Number", value: "PO-4471" },
  { name: "Advance", value: "1500.5" },
  { name: "Remarks", value: "Deliver before Friday" },
  { name: "Phone", value: "9876543210" },
]);
assert.deepStrictEqual(buildUdfList([], customFields, cart), []);
assert.deepStrictEqual(buildUdfList(null, null, cart), []);

console.log("tallyFieldMapping: all assertions passed");
