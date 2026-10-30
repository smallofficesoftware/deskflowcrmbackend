import moment from "moment";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";

// Product custom fields on the online store's product page. A Product Master custom field (custom_field_form_masters,
// form_type 4) is shown to customers only when its "Show On Online Store?" is Yes (show_on_storefront = 1). The value
// sits on the product row itself, in the column named by reference_column_name (products_column_number_1 ...).
// Dropdown and radio options are saved as their own text; a switch is 1 / 0.

const PRODUCT_FORM_TYPE = 4;
// Number, Text, TextArea, Date, DateAndTime, Time, Switch, Decimal, DropDown, Radio. (Page text / URL / attachments /
// document designer pages are not plain values a product page can list.)
const SHOWABLE_DATA_TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** The custom fields that are switched on for the store, in the CRM's own display order. */
export const loadStorefrontCustomFieldDefs = async (tenantDB, companyId) =>
  customFieldFormModel(tenantDB).findAll({
    where: { form_type: PRODUCT_FORM_TYPE, company_masters_id: companyId, show_on_storefront: 1, isDelete: 0, data_type: SHOWABLE_DATA_TYPES },
    attributes: ["title", "data_type", "reference_column_name", "variant_scope"],
    order: [["display_order", "ASC"], ["id", "ASC"]],
    raw: true,
  });

const formatNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? String(Number(n.toFixed(4))) : null;
};

/** One stored value as the text a customer sees; null = nothing worth showing. */
const formatValue = (dataType, raw) => {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  switch (Number(dataType)) {
    case 1: // Number
    case 8: // Decimal
      return formatNumber(text);
    case 4: // Date
      return moment(text).isValid() ? moment(text).format("DD-MM-YYYY") : null;
    case 5: // DateAndTime
      return moment(text).isValid() ? moment(text).format("DD-MM-YYYY hh:mm A") : null;
    case 7: // Switch (1 / 0)
      return text === "1" || text.toLowerCase() === "true" ? "Yes" : "No";
    default: // Text, TextArea, Time, DropDown, Radio
      return text;
  }
};

/**
 * The [{ label, value }] rows for one product row. `kind` decides which fields apply, by the field's "Applies To"
 * (variant_scope: 1 = variant Parent only, 2 = Variant only, 3 = Both): a variant shows 2 and 3, anything else 1 and 3.
 * Empty values are left out, so a product with nothing filled in has no block.
 */
export const customFieldsForRow = (defs, row, kind) =>
  defs
    .filter((d) => (kind === "variant" ? Number(d.variant_scope) !== 1 : Number(d.variant_scope) !== 2))
    .map((d) => ({ label: d.title, value: formatValue(d.data_type, row?.[d.reference_column_name]) }))
    .filter((r) => r.label && r.value !== null);
