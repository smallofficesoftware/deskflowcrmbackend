// Product custom field values for one cart item row. They are stored on the
// cart item itself as products_column_* (same columns orderServices.js's
// productCustomFields reads). The items table's custom columns
// (tableColumns.js customColumns) look their value up here by that key.
const PRODUCT_CUSTOM_COLUMN_PREFIX = "products_column_";

export const pickProductCustomValues = (cartItemRow) => {
  const values = {};
  if (!cartItemRow) return values;
  const row = typeof cartItemRow.get === "function" ? cartItemRow.get({ plain: true }) : cartItemRow;
  Object.keys(row).forEach((key) => {
    if (key.startsWith(PRODUCT_CUSTOM_COLUMN_PREFIX) && row[key] !== undefined && row[key] !== null) {
      values[key] = row[key];
    }
  });
  return values;
};
