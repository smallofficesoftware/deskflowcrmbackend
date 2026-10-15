// Server-side check of the Job Card page's add/edit/delete rights. The web and
// mobile apps hide their buttons, but the API must refuse too, otherwise any
// other screen (or a direct call) can create a job card without the right.
//
// Same model as formBuilderRights.js: the company owner always passes, anyone
// else needs the flag set in their application_login_type_rights row for
// PAGE_ID.JOB_CARD. No rights row means no access.
import { isCompanyOwner } from "../../middlewares/reportPinAuth.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { getCompanyByLoginId } from "../commonServices.js";

// `flag` is the key inside a_page_id_rights_jason: "add" | "edit" | "delete" |
// "view". `pageId` defaults to the Job Card page; pass another PAGE_ID for the
// pages the web UI also checks (Label, Status, Assign To Team Member, Production).
export async function hasJobCardRight({ a_application_login_id, tenantDB, flag, pageId = PAGE_ID.JOB_CARD }) {
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company) return false;

    if (await isCompanyOwner(a_application_login_id, company.company_masters_id)) return true;

    const { raw } = await getUserRights({
        company_masters_id: company.company_masters_id,
        a_application_login_id,
        page_id: pageId,
        tenentId: tenantDB,
    });
    return raw?.[flag] == 1;
}
