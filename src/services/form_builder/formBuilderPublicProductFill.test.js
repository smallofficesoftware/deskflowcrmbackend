import test from "node:test";
import assert from "node:assert/strict";
import { allowedProductFillColumns, pickAllowedValues } from "./formBuilderPublicProductFill.js";

const repeater = (columns) => ({ type: "repeater", key: "items", columns });
const productCol = (map) => ({ type: "reference", master: "product", key: "p", product_fill_map: map });

test("allowedProductFillColumns: only mapped details of product columns in repeaters", () => {
  const fields = [repeater([productCol({ rate: "price", unit: "", product_code: null }), { type: "text", key: "price" }])];
  assert.deepEqual([...allowedProductFillColumns(fields)], ["rate"]);
});

test("allowedProductFillColumns: unions several columns, ignores non-product and non-repeater fields", () => {
  const fields = [
    repeater([productCol({ rate: "a" }), productCol({ unit: "b" })]),
    repeater([{ type: "reference", master: "category", key: "c", product_fill_map: { rate: "x" } }]),
    { type: "reference", master: "product", key: "top", product_fill_map: { product_code: "y" } },
  ];
  assert.deepEqual([...allowedProductFillColumns(fields)].sort(), ["rate", "unit"]);
});

test("allowedProductFillColumns: no map / junk map / junk input gives nothing", () => {
  assert.equal(allowedProductFillColumns([repeater([productCol(undefined)])]).size, 0);
  assert.equal(allowedProductFillColumns([repeater([productCol(["rate"])])]).size, 0);
  assert.equal(allowedProductFillColumns(null).size, 0);
});

test("pickAllowedValues keeps only allowed keys", () => {
  const values = { rate: 10, unit: "Nos", product_code: "A1", product_name: "Secret" };
  assert.deepEqual(pickAllowedValues(values, new Set(["rate", "unit"])), { rate: 10, unit: "Nos" });
  assert.deepEqual(pickAllowedValues(values, new Set()), {});
  assert.deepEqual(pickAllowedValues(null, new Set(["rate"])), {});
});
