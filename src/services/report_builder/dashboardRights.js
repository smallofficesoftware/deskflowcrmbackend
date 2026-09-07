// Dashboard's own access control — reuses the SAME
// application_login_type_rights mechanism (page_id + view/add/edit/delete
// + all_data/personal flags, src/helpers/rightsHelper.js's getUserRights)
// every other module in this app already uses for its own PAGE_ID (e.g.
// Task Management's taskManagementServices.js), rather than a new
// per-resource grant table like Report Builder's own
// report_definition_team_rights. A dashboard has one natural owner column
// already (dashboards.a_application_login_id, the creator) — "personal"
// scope means "only dashboards I created", same shape Task Management's
// own personal/assigned split has, just simpler (no separate assignment
// list for a dashboard).
//
// The company owner always bypasses this entirely (same precedent
// isCompanyOwner already sets for the PIN/report-scope checks elsewhere in
// this module) — essential since PAGE_ID.DASHBOARD_BUILDER (160) is a
// brand-new page, so no company has any application_login_type_rights rows
// for it yet until an admin explicitly grants them via the existing Team
// Rights screen (same generic page-rights editor every other page uses,
// no new UI needed for that).
import { isCompanyOwner } from "../../middlewares/reportPinAuth.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";

export async function resolveDashboardRights({ company_masters_id, a_application_login_id, tenantDB }) {
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
    page_id: PAGE_ID.DASHBOARD_BUILDER,
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
