import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { CART_CUSTOM_FIELD_FORM_TYPE_BY_DOC_TYPE } from "./dataDictionary.js";

// Designer preview used to pass customFieldRows: [], so a field "Bound to
// Data" to a cart custom field always rendered blank in Preview even when the
// previewed cart had a value. This loads the same rows a real print does
// (orderServices.js's customFieldsWhere: company, print_or_not = 1, the doc
// type's cart form_type). Doc types without a cart custom-field form_type get
// no rows, same as before.
export const loadPreviewCustomFieldRows = async (tenantDB, company_masters_id, doc_type) => {
  const formType = CART_CUSTOM_FIELD_FORM_TYPE_BY_DOC_TYPE[doc_type];
  if (!formType || !company_masters_id) return [];

  return customFieldFormModel(tenantDB).findAll({
    where: {
      isDelete: 0,
      company_masters_id,
      print_or_not: 1,
      form_type: formType,
    },
    order: [["display_order", "ASC"]],
  });
};
