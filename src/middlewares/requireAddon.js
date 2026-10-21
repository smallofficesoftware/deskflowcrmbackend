import sequelize from "../config/sequelize.js";
import { applicationLoginTypeRightModel } from "../models/application_login/applicationLoginTypeRightModel.js";
import { resError } from "../utils/sharedFunctions.js";

// Generic marketplace-addon gate, shared by every addon (Tally, the ecommerce
// storefront, and any future one) - NOT a one-off per-addon check. See
// plans/2026-10-08-marketplace-tally-plan.txt (4.1) and plans/2026-10-15-
// ecommerce-b2b-b2c-plan.txt (Q1/4.1) for the cross-plan decision this
// implements: one a_application_pages row (master DB, page_slug = appCode)
// used only as a lookup key, and the actual on/off state as a JSON blob in
// a_application_login_type_rights (tenant DB), same table every other
// per-company permission/limit already uses (see workspaceRightsLimit.js,
// the read pattern this file copies) - never customer_masters, never the
// billing bridge, at request time.
//
// Deliberately does NOT touch plan_vs_pages - an addon's page row is not
// wired into the old plan/page menu-entitlement system.

/**
 * Resolve whether `appCode` (an a_application_pages.page_slug) is enabled for
 * company_masters_id, by reading that company's a_page_id_rights_jason JSON
 * in its own tenant DB. Returns { enabled, pageId } - pageId is null if the
 * addon has no a_application_pages row at all (not registered yet).
 */
export const isAppEnabledForCompany = async (tenantDB, company_masters_id, appCode) => {
  if (!tenantDB || !company_masters_id || !appCode) return { enabled: false, pageId: null };

  const [page] = await sequelize.query(
    "SELECT `id` FROM `a_application_pages` WHERE `page_slug` = ? AND `isDelete` = 0 LIMIT 1",
    { replacements: [appCode], type: sequelize.QueryTypes.SELECT }
  );
  if (!page?.id) return { enabled: false, pageId: null };

  // findAll, not findOne: a company can have more than one row for the same
  // page_id (e.g. one per a_application_login_id) - same defensive read as
  // workspaceRightsLimit.js. Enabled if ANY row says so.
  const rows = await applicationLoginTypeRightModel(tenantDB).findAll({
    where: { company_masters_id, page_id: page.id, isDelete: 0 },
    attributes: ["a_page_id_rights_jason"],
    raw: true,
  });

  let enabled = false;
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.a_page_id_rights_jason || "{}");
      if (parsed?.is_enabled) {
        enabled = true;
        break;
      }
    } catch (err) {
      // malformed row - skipped, same as workspaceRightsLimit.js
    }
  }
  return { enabled, pageId: page.id };
};

/** Express middleware factory: requireAddon('tally') on any route that needs the gate. */
export const requireAddon = (appCode) => async (req, res, next) => {
  try {
    const company_masters_id = req.user?.companyId;
    if (!req.tenantDB || !company_masters_id) {
      return res.status(200).send(
        resError({ code: 403, ack_msg: "Please login", developer_msg: "Tenant DB or company context missing" })
      );
    }

    const { enabled, pageId } = await isAppEnabledForCompany(req.tenantDB, company_masters_id, appCode);
    if (!enabled) {
      return res.status(200).send(
        resError({
          code: 403,
          ack_msg: "This addon is not enabled for your company",
          developer_msg: pageId
            ? `Addon '${appCode}' not enabled for company_masters_id=${company_masters_id}`
            : `Addon '${appCode}' has no a_application_pages row (page_slug not registered)`,
        })
      );
    }

    next();
  } catch (error) {
    return res.status(200).send(resError({ developer_msg: `requireAddon('${appCode}') failed: ${error}` }));
  }
};
