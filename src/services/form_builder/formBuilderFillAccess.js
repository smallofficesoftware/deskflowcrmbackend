// Fill-only access to a published form. getForm normally requires Form Builder
// management rights (loadOwnedForm), but the staff-facing Submit Form picker
// (listPublishedFormsForFilling) shows a form to anyone who may fill it - so a
// team member without Form Builder rights saw the form and then got
// "You don't have permission to open this form" when opening it. This applies
// the same visibility rule as the picker so opening matches listing.
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resolveFormAccess } from "./formBuilderRights.js";
import { loadActorContext } from "./formBuilderApprovalService.js";

// Returns { form, company_masters_id, a_application_login_id } for a form this
// login may fill, or null. Only published forms qualify, and the returned form
// carries the published schema in place of the draft so a fill-only user never
// sees unpublished edits or the public share token.
export async function loadFormForFill(req) {
  const id = req.body?.id ?? req.params?.id;
  const a_application_login_id = req.body?.a_application_login_id;
  const company = await getCompanyByLoginId(a_application_login_id);
  if (!company) return null;
  const company_masters_id = company.company_masters_id;

  const form = await formBuilderFormModel(req.tenantDB).findOne({
    where: { id, company_masters_id, isDelete: 0 },
  });
  if (!form || !form.published_schema_json) return null;

  let allowed = !form.restrict_to_assigned_team;
  if (!allowed) {
    const access = await resolveFormAccess({ form, company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
    allowed = !!access.canFill;
  }
  if (!allowed) {
    // A person who works on one of the form's approval stages may open it too.
    const actor = await loadActorContext({ form, loginId: a_application_login_id, company_masters_id });
    allowed = !!(actor.approval.enabled && (actor.owner || actor.myStageIds.length > 0));
  }
  if (!allowed) return null;

  form.set("schema_json", form.published_schema_json);
  form.set("share_token", null);
  return { form, company_masters_id, a_application_login_id };
}
