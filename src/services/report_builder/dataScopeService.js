// Per-report, per-team-member data-scope rights (Step 7 of the plan) —
// replaces the page-level getUserRights() call queryEngine.js/
// compositeEngine.js used to make. Visibility/scope is now decided ENTIRELY
// by report_definition_team_rights: a row for (report_definition_id,
// a_application_login_id) grants that scope; no row means no access at
// all, independent of any page-level a_application_login_type_rights flag.
// The owner is the one bypass, same as every other gate in this codebase.
import { Op } from "sequelize";
import moment from "moment";
import { isCompanyOwner } from "../../middlewares/reportPinAuth.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { reportDefinitionTeamRightModel } from "../../models/report_builder/reportDefinitionTeamRightModel.js";
import { getRegisteredModel } from "./modelRegistry.js";

const now = () => moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

// scope: "own" | "all" | "chain" | null (null = no access at all).
export const getReportDataScope = async ({ report_definition_id, a_application_login_id, company_masters_id, tenantDB }) => {
  try {
    const owner = await isCompanyOwner(a_application_login_id, company_masters_id);
    if (owner) return { scope: "all" };

    const RightsModel = reportDefinitionTeamRightModel(tenantDB);
    const grant = await RightsModel.findOne({
      where: { report_definition_id, a_application_login_id, company_masters_id, isDelete: 0 },
    });
    if (!grant) return { scope: null };
    return { scope: grant.data_scope };
  } catch (e) {
    console.error("getReportDataScope error:", e);
    return { scope: null }; // fail closed
  }
};

// One level deep only — confirmed against the app's real existing
// "chain-wise" report (chainContactReportService.js: parent contacts +
// their direct referance_contact children, no recursion) and
// modelRegistry.js's own contacts.children relation, which is the same
// shallow shape. Returns [] (never undefined) so callers can safely
// Op.in an empty/no-match set.
export const resolveChainContactIds = async (tenantDB, company_masters_id, a_application_login_id) => {
  const Contact = contactModel(tenantDB);
  const own = await Contact.findAll({
    where: { company_masters_id, a_application_login_id, isDelete: 0 },
    attributes: ["id"],
    raw: true,
  });
  const ownIds = own.map((c) => c.id);
  if (ownIds.length === 0) return [];

  const referred = await Contact.findAll({
    where: { company_masters_id, referance_contact: { [Op.in]: ownIds }, isDelete: 0 },
    attributes: ["id"],
    raw: true,
  });
  return [...new Set([...ownIds, ...referred.map((c) => c.id)])];
};

// Finds this table's OWN contact-relation foreign key — never assumes the
// relation is literally named "contact" (carts names it "customer") or
// that one exists at all. Returns null when the table has no contact
// relation (expenses, salary_registers, attendance, target_vs_incentives,
// products, stock_ledger, employee_transactions, employee_outstanding,
// cart_items — confirmed by checking every MODEL_REGISTRY entry directly,
// not assumed; task_managements DOES have one via modelKey:"contacts",
// corrected after an earlier wrong assumption here) or IS contacts itself
// (filtered on its own `id`, not a relation, see callers).
export const findContactForeignKey = (model_key) => {
  const registryEntry = getRegisteredModel(model_key);
  if (!registryEntry?.relations) return null;
  const contactRelation = Object.values(registryEntry.relations).find((rel) => rel.modelKey === "contacts");
  return contactRelation?.foreignKey || null;
};

// Builds the WHERE fragment for the "chain" scope on a given table — the
// one piece genuinely specific to queryEngine.js's row shape, kept here so
// both it and compositeEngine.js (which has no meaningful "chain" — see its
// own fallback-to-own comment) don't duplicate the resolution logic.
export const buildChainWhere = async ({ model_key, tenantDB, company_masters_id, a_application_login_id }) => {
  const chainIds = await resolveChainContactIds(tenantDB, company_masters_id, a_application_login_id);
  const idsOrNone = chainIds.length > 0 ? chainIds : [0];

  if (model_key === "contacts") {
    return { company_masters_id, id: { [Op.in]: idsOrNone } };
  }
  const foreignKey = findContactForeignKey(model_key);
  if (!foreignKey) {
    // Documented limitation — no contact relation on this table, "chain"
    // has no defined meaning here, fall back to "own" behavior instead of
    // an undefined/wrong result.
    return { company_masters_id, a_application_login_id };
  }
  return { company_masters_id, [foreignKey]: { [Op.in]: idsOrNone } };
};

// Manage Access modal's save — bulk upsert against report_definition_team_rights.
// grants: [{a_application_login_id, data_scope}]. removals: a_application_login_id[]
// whose row gets soft-deleted (Step 7's "Remove Access" — deletes the row,
// no separate is_blocked state needed once page-level access isn't a factor).
export const setReportTeamRights = async ({ report_definition_id, company_masters_id, grants = [], removals = [] }, tenantDB) => {
  const RightsModel = reportDefinitionTeamRightModel(tenantDB);

  for (const g of grants) {
    const existing = await RightsModel.findOne({
      where: { report_definition_id, a_application_login_id: g.a_application_login_id, company_masters_id },
    });
    if (existing) {
      await existing.update({ data_scope: g.data_scope, isDelete: 0 });
    } else {
      await RightsModel.create({
        report_definition_id,
        company_masters_id,
        a_application_login_id: g.a_application_login_id,
        data_scope: g.data_scope,
        created_date_time: now(),
      });
    }
  }

  for (const loginId of removals) {
    await RightsModel.update(
      { isDelete: 1 },
      { where: { report_definition_id, a_application_login_id: loginId, company_masters_id } },
    );
  }
};
