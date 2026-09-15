// Report Builder's own access control — mirrors dashboardRights.js exactly,
// keyed to PAGE_ID.REPORT_BUILDER instead of PAGE_ID.DASHBOARD_BUILDER.
// Reuses the SAME application_login_type_rights mechanism (page_id +
// view/add/edit/delete + all_data/personal flags,
// src/helpers/rightsHelper.js's getUserRights) every other module already
// uses for its own PAGE_ID (Task Management, and now Dashboard Builder),
// rather than inventing a second grant table. report_definitions already
// has an owner column (a_application_login_id, the creator) — "personal"
// scope means "only reports I created", same shape dashboardRights.js's own
// personal scope has.
//
// This is deliberately separate from report_definition_team_rights
// (dataScopeService.js) — that table governs RUNNING one specific already-
// built report a non-owner was explicitly granted, unrelated to whether a
// login can build/edit/delete report definitions or manage those very
// grants. The two checks stack: a login could have Report Builder edit
// rights (can build reports) yet still need a team-rights grant to run
// someone else's, or vice versa (a team-rights grant to run a report, no
// Report Builder rights to ever build/edit one).
//
// The company owner always bypasses this entirely, same precedent
// isCompanyOwner already sets everywhere else in this module — since most
// existing companies have no application_login_type_rights rows yet for
// PAGE_ID.REPORT_BUILDER (build access was owner+PIN-only until this
// point), the owner must keep full access with no seeded rights row.
import { isCompanyOwner } from "../../middlewares/reportPinAuth.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";

export async function resolveReportBuilderRights({ company_masters_id, a_application_login_id, tenantDB }) {
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
    page_id: PAGE_ID.REPORT_BUILDER,
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
