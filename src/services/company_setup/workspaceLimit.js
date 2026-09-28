import sequelize from "../../config/sequelize.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { WORKSPACE_PAGE_SLUG, decideWorkspaceCreate, parseWorkspaceLimit } from "./workspaceLimitRules.js";

const STORAGE_PAGE_SLUG = "data_stored_on_a_secure_cloud";

// Workspace limit per plan: plan_vs_pages.data_limit of the "Workspaces" page
// (a_application_pages.page_slug = "workspaces"), edited on Admin Panel -> Plans like every other limit.
// The limit is the number of workspaces a Main Company may create (the Main Company itself is not counted).
// "0" / empty on the plan row = no limit. A plan without the row falls back to the default of 1.

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

/** Full check for createWorkspace: { allowed, limit, used }. */
export const checkWorkspaceLimit = async (parent_company_id) => {
  const [planInfo, used] = await Promise.all([getWorkspaceLimit(parent_company_id), countWorkspaces(parent_company_id)]);
  return decideWorkspaceCreate({ ...planInfo, used });
};

/** Plan usage extras for the Manage Workspaces screen / company list: { limit (null = unlimited), used, storage_limit_gb (plan limit only) }. */
export const getWorkspaceLimitInfo = async (req) => {
  const parent_company_id = Number(req.body?.parent_company_id);
  if (!parent_company_id) {
    return resError({ ack_msg: "Parent company ID is required", developer_msg: "Required fields missing" });
  }
  try {
    const { limit, used } = await checkWorkspaceLimit(parent_company_id);
    const storage = await getPlanPageLimit(parent_company_id, STORAGE_PAGE_SLUG);
    return resSuccess({
      data: { item: { limit, used, storage_limit_gb: storage.hasPlanEntry ? parseWorkspaceLimit(storage.rawDataLimit) : null } },
    });
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};
