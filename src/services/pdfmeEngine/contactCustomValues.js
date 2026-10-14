import { Op } from "sequelize";
import { contactModel } from "../../models/activities/contactModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";

// Contact module's custom fields (same form_type dataDictionary.js uses).
const CONTACT_CUSTOM_FIELD_FORM_TYPE = 1;

// A cart document can show the buyer's own Contact Custom Fields
// (cntc_column_*). Returns { <reference_column_name>: value } for the buyer
// contact, keyed exactly like the dictionary entries buildDataDictionary
// offers under "Contact Custom Field", so a field or a {{token}} on the
// canvas resolves the same way the Cart Custom Field ones do. Empty object
// when the cart has no buyer contact (e.g. the sample preview).
export const loadBuyerContactCustomValues = async (tenantDB, company_masters_id, cart) => {
  const contactId = cart?.to_customer_id;
  if (!contactId || !company_masters_id) return {};

  // Same filters as the dictionary: printable, and not the page-type fields
  // (11/12/14) that render as extra pages instead of bindable data.
  const fields = await customFieldFormModel(tenantDB).findAll({
    where: {
      form_type: CONTACT_CUSTOM_FIELD_FORM_TYPE,
      company_masters_id,
      print_or_not: 1,
      isDelete: 0,
      data_type: { [Op.notIn]: [11, 12, 14] },
    },
    attributes: ["reference_column_name"],
    raw: true,
  });
  if (!fields.length) return {};

  const contact = await contactModel(tenantDB).findOne({ where: { id: contactId }, raw: true });
  if (!contact) return {};

  const values = {};
  fields.forEach((f) => {
    const value = contact[f.reference_column_name];
    values[f.reference_column_name] = value === undefined || value === null ? "" : String(value);
  });
  return values;
};
