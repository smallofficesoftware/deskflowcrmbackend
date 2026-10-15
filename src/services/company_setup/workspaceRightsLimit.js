import sequelize from "../../config/sequelize.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import { WORKSPACE_PAGE_SLUG, pickRightsLimit } from "./workspaceLimitRules.js";

// The Workspaces limit as the contact check reads it: application_login_type_rights.a_page_id_rights_jason.limit
// of the company's rows for the Workspaces page (looked up by slug, there is no PAGE_ID constant and ids can
// differ per server). Returns a number, null (unlimited) or undefined (nothing usable - plan lookup applies).
export const getWorkspaceRightsLimit = async (tenantDB, company_masters_id) => {
  if (!tenantDB || !company_masters_id) return undefined;

  const [page] = await sequelize.query(
    "SELECT `id` FROM `a_application_pages` WHERE `page_slug` = ? AND `isDelete` = 0 LIMIT 1",
    { replacements: [WORKSPACE_PAGE_SLUG], type: sequelize.QueryTypes.SELECT }
  );
  if (!page?.id) return undefined;

  const rows = await applicationLoginTypeRightModel(tenantDB).findAll({
    where: { company_masters_id, page_id: page.id, isDelete: 0 },
    attributes: ["a_page_id_rights_jason"],
    raw: true,
  });

  const parsed = [];
  for (const row of rows) {
    try {
      parsed.push(JSON.parse(row.a_page_id_rights_jason || "{}"));
    } catch (err) {
      // a malformed row is skipped, same as the contact check
    }
  }
  return pickRightsLimit(parsed);
};
