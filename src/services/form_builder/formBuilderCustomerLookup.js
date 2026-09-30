// Customer lookup field (plan item F): type-ahead search on the company's
// existing contacts so the person filling a form picks a customer instead of
// retyping their details.
//
//   POST /form-builder/customer-search  { form_id, q, limit? }
//     -> { items: [{ id, label, person_name, company_name, mobile_number,
//                    email_id, city, address, pincode, gst_number }] }
//
// Internal only (never offered on a public form). The caller must be able to
// fill the given form — this endpoint is a way to look up a customer WHILE
// filling that form, not a general contact search.
import { QueryTypes } from "sequelize";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { resolveFormAccess } from "./formBuilderRights.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 20;

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function customerLabel(row) {
  const name = (row.person_name || "").trim();
  const company = (row.company_name || "").trim();
  return name && company ? `${name} (${company})` : name || company || `Contact #${row.id}`;
}

export const searchCustomers = async (req) => {
  try {
    const a_application_login_id = req.body?.a_application_login_id;
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company) return resError({ ack_msg: "Company not found for login ID" });
    const company_masters_id = company.company_masters_id;

    const { form_id, q } = req.body || {};
    const form = await formBuilderFormModel(req.tenantDB).findOne({ where: { id: form_id, company_masters_id, isDelete: 0 } });
    if (!form || !form.published_schema_json) return resError({ ack_msg: "Form not found or not published" });

    const access = await resolveFormAccess({ form, company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
    if (!access.canFill) return resError({ code: 403, ack_msg: "No access to fill this form" });

    const text = String(q ?? "").trim();
    if (text.length < MIN_QUERY_LENGTH) return resSuccess({ data: { items: [] } });
    const limit = Math.min(Math.max(Number(req.body?.limit) || MAX_RESULTS, 1), MAX_RESULTS);

    const rows = await req.tenantDB.query(
      `SELECT id, person_name, company_name, mobile_number, email_id, city, address, pincode, gst_number
       FROM \`contact_masters\`
       WHERE isDelete = 0
         AND (person_name LIKE :like OR company_name LIKE :like OR mobile_number LIKE :like OR raw_mobile_number LIKE :like)
       ORDER BY person_name ASC
       LIMIT ${limit}`,
      { replacements: { like: `%${escapeLike(text)}%` }, type: QueryTypes.SELECT },
    );

    return resSuccess({ data: { items: rows.map((r) => ({ ...r, label: customerLabel(r) })) } });
  } catch (e) {
    console.error("searchCustomers error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
