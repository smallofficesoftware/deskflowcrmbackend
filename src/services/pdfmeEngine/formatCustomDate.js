import moment from "moment";

// Custom-field date columns (carts_column_date_N / cntc_column_date_N) hold a
// DATEONLY value, which arrives as "YYYY-MM-DD". Printed raw it reads
// 2026-10-31 on the document; every other date on the print is DD-MM-YYYY.
// "date_and_time" columns are a different key family and left untouched.
const DATE_COLUMN_PATTERN = /_column_date_\d+$/;

export const isCustomDateColumn = (columnName) => DATE_COLUMN_PATTERN.test(columnName || "");

// "" for empty / zero-date ("0000-00-00") / unparseable values, so a bad value
// prints nothing instead of a wrong or malformed date.
export const formatCustomDate = (value) => {
  if (value === undefined || value === null || value === "") return "";
  const parsed = moment(value, ["YYYY-MM-DD", moment.ISO_8601], true);
  if (!parsed.isValid() || parsed.year() < 1900) return "";
  return parsed.format("DD-MM-YYYY");
};

// Formats only the date columns of a { <column_name>: value } map, in place of
// the raw value. Other keys pass through unchanged.
export const formatCustomDateValues = (values) => {
  const out = { ...values };
  Object.keys(out).forEach((key) => {
    if (isCustomDateColumn(key)) out[key] = formatCustomDate(out[key]);
  });
  return out;
};
