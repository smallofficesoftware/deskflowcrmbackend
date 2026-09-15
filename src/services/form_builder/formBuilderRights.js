// Form Builder's own access control — mirrors reportBuilderRights.js
// exactly, keyed to PAGE_ID.FORM_BUILDER instead of PAGE_ID.REPORT_BUILDER.
// Reuses the SAME application_login_type_rights mechanism (page_id +
// view/add/edit/delete + all_data/personal flags, src/helpers/
// rightsHelper.js's getUserRights) every other module already uses for its
// own PAGE_ID, rather than inventing a second grant table. See plan §2 for
// the corrected permission model (an earlier draft wrongly assumed
// requireReportPin, which only gates Document Designer).
//
// This is Tier 1 (company-wide Form Builder access). Tier 2 (per-form
// assigned team members, form_builder_form_team_rights) is a separate,
// still-enforced check on top of this one — see formBuilderService.js's
// resolveSubmissionAccess.
//
// The company owner always bypasses this entirely, same precedent
// isCompanyOwner already sets everywhere else — most existing companies
// have no application_login_type_rights rows yet for PAGE_ID.FORM_BUILDER,
// so the owner must keep full access with no seeded rights row.
import { isCompanyOwner } from "../../middlewares/reportPinAuth.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { formBuilderFormTeamRightModel } from "../../models/form_builder/formBuilderFormTeamRightModel.js";

export async function resolveFormBuilderRights({ company_masters_id, a_application_login_id, tenantDB }) {
  const owner = await isCompanyOwner(a_application_login_id, company_masters_id);
  if (owner) {
    return {
      isOwner: true,
      canView: true,
      canAdd: true,
      canEdit: true,
      canDelete: true,
      showAllData: true,
      showPersonalData: false,
    };
  }

  const { showAllData, showPersonalData, raw } = await getUserRights({
    company_masters_id,
    a_application_login_id,
    page_id: PAGE_ID.FORM_BUILDER,
    tenentId: tenantDB,
  });

  return {
    isOwner: false,
    canView: !!(showAllData || showPersonalData),
    canAdd: raw?.add == 1,
    canEdit: raw?.edit == 1,
    canDelete: raw?.delete == 1,
    showAllData,
    showPersonalData,
  };
}

// Tier 2 — per-form assigned team members. Mirrors setReportTeamRights/
// getReportTeamRights (dataScopeService.js / reportDefinitionServices.js)
// exactly: {grants, removals} shape, upsert-or-create on grant, soft-delete
// on removal — same "Manage Access" pattern, just form_id/can_fill/
// submissions_scope instead of report_definition_id/data_scope.
export async function getFormTeamRights({ form_id, company_masters_id, tenantDB }) {
  const RightsModel = formBuilderFormTeamRightModel(tenantDB);
  return RightsModel.findAll({
    where: { form_id, company_masters_id, isDelete: 0 },
    attributes: ["a_application_login_id", "can_fill", "submissions_scope"],
    raw: true,
  });
}

export async function setFormTeamRights({ form_id, company_masters_id, grants = [], removals = [] }, tenantDB) {
  const RightsModel = formBuilderFormTeamRightModel(tenantDB);

  for (const g of grants) {
    const existing = await RightsModel.findOne({
      where: { form_id, a_application_login_id: g.a_application_login_id, company_masters_id },
    });
    if (existing) {
      await existing.update({
        can_fill: g.can_fill != null ? g.can_fill : 1,
        submissions_scope: g.submissions_scope || "own",
        isDelete: 0,
      });
    } else {
      await RightsModel.create({
        form_id,
        company_masters_id,
        a_application_login_id: g.a_application_login_id,
        can_fill: g.can_fill != null ? g.can_fill : 1,
        submissions_scope: g.submissions_scope || "own",
        created_date_time: new Date(),
      });
    }
  }

  for (const loginId of removals) {
    await RightsModel.update(
      { isDelete: 1 },
      { where: { form_id, a_application_login_id: loginId, company_masters_id } },
    );
  }
}

// Combined access resolution for one specific form — the rule chain from
// plan §2: owner sees everything; else Tier 1 showAllData sees every
// form/submission in the company; else Tier 1 showPersonalData is scoped
// to forms this login created; else fall through to this form's own Tier 2
// row if one exists; else no access. Used by formBuilderSubmissionService.js
// to decide fill/view/edit access to one form's submissions, and by
// formBuilderService.js to decide whether a restrict_to_assigned_team form
// is even visible to this login at all.
export async function resolveFormAccess({ form, company_masters_id, a_application_login_id, tenantDB }) {
  const tier1 = await resolveFormBuilderRights({ company_masters_id, a_application_login_id, tenantDB });

  if (tier1.isOwner) {
    return { canFill: true, canEdit: true, canDelete: true, submissionsScope: "all" };
  }
  if (tier1.showAllData) {
    return { canFill: true, canEdit: tier1.canEdit, canDelete: tier1.canDelete, submissionsScope: "all" };
  }
  const isCreator = String(form.a_application_login_id) === String(a_application_login_id);
  if (tier1.showPersonalData && isCreator) {
    return { canFill: true, canEdit: tier1.canEdit, canDelete: tier1.canDelete, submissionsScope: "all" };
  }

  const RightsModel = formBuilderFormTeamRightModel(tenantDB);
  const tier2Row = await RightsModel.findOne({
    where: { form_id: form.id, a_application_login_id, company_masters_id, isDelete: 0 },
    raw: true,
  });
  if (!tier2Row) {
    return { canFill: false, canEdit: false, canDelete: false, submissionsScope: "none" };
  }
  return {
    canFill: !!tier2Row.can_fill,
    // Tier 2 grants fill access, not build/delete rights on the form
    // itself — editing a submission still requires can_fill (plan §4:
    // "can_fill is read as can create AND edit within their visibility
    // scope"), but the form definition itself stays Tier-1-only.
    canEdit: !!tier2Row.can_fill,
    canDelete: false,
    submissionsScope: tier2Row.submissions_scope,
  };
}
