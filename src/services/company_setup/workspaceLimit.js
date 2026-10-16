import sequelize from "../../config/sequelize.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { WORKSPACE_PAGE_SLUG, decideWorkspaceCreate, parseWorkspaceLimit } from "./workspaceLimitRules.js";
import { getWorkspaceRightsLimit } from "./workspaceRightsLimit.js";

const STORAGE_PAGE_SLUG = "data_stored_on_a_secure_cloud";

// Workspace limit: read like the contact limit, from application_login_type_rights.a_page_id_rights_jason.limit
// of the "Workspaces" page (a_application_pages.page_slug = "workspaces"), which is seeded from
// plan_vs_pages.data_limit (edited on Admin Panel -> Plans like every other limit) - see workspaceRightsLimit.js.
// The limit is the number of workspaces a Main Company may create (the Main Company itself is not counted).
// 0 = no limit. Empty / missing = the default of 1 (no plan_vs_pages lookup).

/** Raw plan_vs_pages.data_limit of a page (by slug) on the company's current plan (company_masters.plan_id); { hasPlanEntry, rawDataLimit }. */
const getPlanPageLimit = async (company_masters_id, pageSlug) => {
  const plan = await companyModel.findOne({
    where: { id: company_masters_id },
    attributes: ["plan_id"],
    raw: true,
  });
  if (!plan?.plan_id) return { hasPlanEntry: false, rawDataLimit: null };
  const [entry] = await sequelize.query(
    "SELECT pvp.`data_limit` FROM `plan_vs_pages` pvp " +
      "JOIN `a_application_pages` p ON p.`id` = pvp.`page_id` AND p.`isDelete` = 0 " +
      "WHERE pvp.`plan_id` = ? AND p.`page_slug` = ? AND pvp.`isDelete` = 0 AND pvp.`isActive` = 1 LIMIT 1",
    { replacements: [plan.plan_id, pageSlug], type: sequelize.QueryTypes.SELECT }
  );
  return entry ? { hasPlanEntry: true, rawDataLimit: entry.data_limit } : { hasPlanEntry: false, rawDataLimit: null };
};

export const getWorkspaceLimit = (company_masters_id) => getPlanPageLimit(company_masters_id, WORKSPACE_PAGE_SLUG);

export const countWorkspaces = (parent_company_id) =>
  companyModel.count({ where: { parent_company_id, isDelete: 0 } });

/**
 * Full check for createWorkspace: { allowed, limit, used }.
 * The base limit is read from the rights JSON like the contact check does (see workspaceRightsLimit.js);
 * when it holds no usable limit the default of 1 applies - there is no plan_vs_pages lookup.
 */
export const checkWorkspaceLimit = async (parent_company_id, tenantDB) => {
  const [used, rightsLimit] = await Promise.all([
    countWorkspaces(parent_company_id),
    getWorkspaceRightsLimit(tenantDB, parent_company_id),
  ]);
  return decideWorkspaceCreate({ hasPlanEntry: false, rawDataLimit: null, used, rightsLimit });
};

/** Plan usage extras for the Manage Workspaces screen / company list: { limit (null = unlimited), used, storage_limit_gb (plan limit only) }. */
export const getWorkspaceLimitInfo = async (req) => {
  const parent_company_id = Number(req.body?.parent_company_id);
  if (!parent_company_id) {
    return resError({ ack_msg: "Parent company ID is required", developer_msg: "Required fields missing" });
  }
  try {
    const { limit, used } = await checkWorkspaceLimit(parent_company_id, req.tenantDB);
    const storage = await getPlanPageLimit(parent_company_id, STORAGE_PAGE_SLUG);
    return resSuccess({
      data: { item: { limit, used, storage_limit_gb: storage.hasPlanEntry ? parseWorkspaceLimit(storage.rawDataLimit) : null } },
    });
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};
