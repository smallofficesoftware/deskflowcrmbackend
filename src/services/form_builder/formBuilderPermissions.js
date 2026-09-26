// Per-form permissions (Form Builder v2 section 3/7 — "Permissions" tab).
// Rows live in form_builder_form_permissions; keys and grant validation are
// in formBuilderPermissionKeys.js (pure).
//
// Who has a permission on a form:
//   - the company owner, always (same isCompanyOwner bypass
//     formBuilderRights.js uses);
//   - a login with a live row for (form, key, a_application_login_id);
//   - a login whose team has a live row for (form, key, team_id). A "team"
//     is a department (departments.id); a login belongs to the team in
//     a_application_logins.department — the same field the Edit Team
//     Member screen sets. There is no separate team-group table in the CRM.
import { Op } from "sequelize";
import { isCompanyOwner } from "../../middlewares/reportPinAuth.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { departmentModel } from "../../models/hr/departmentModel.js";
import { formBuilderFormPermissionModel } from "../../models/form_builder/formBuilderFormPermissionModel.js";
import { FORM_PERMISSION_KEYS, isValidPermissionKey } from "./formBuilderPermissionKeys.js";

export async function loginTeamId(loginId) {
  if (!loginId) return null;
  const row = await loginModel.findOne({ where: { id: loginId }, attributes: ["department"], raw: true });
  const team = Number(row?.department);
  return Number.isInteger(team) && team > 0 ? team : null;
}

function targetWhere(loginId, teamId) {
  const or = [{ a_application_login_id: loginId }];
  if (teamId) or.push({ team_id: teamId });
  return { [Op.or]: or };
}

export async function hasFormPermission({ form, permissionKey, loginId, company_masters_id, tenantDB }) {
  if (!form || !loginId || !isValidPermissionKey(permissionKey)) return false;
  if (await isCompanyOwner(loginId, company_masters_id)) return true;
  const teamId = await loginTeamId(loginId);
  const Model = formBuilderFormPermissionModel(tenantDB);
  const row = await Model.findOne({
    where: {
      form_id: form.id,
      company_masters_id,
      permission_key: permissionKey,
      isDelete: 0,
      isActive: 1,
      ...targetWhere(loginId, teamId),
    },
    attributes: ["id"],
    raw: true,
  });
  return !!row;
}

// Every key at once, for get/list responses: { change_dates: true, ... }.
export async function getMyFormPermissions({ form, loginId, company_masters_id, tenantDB }) {
  const result = Object.fromEntries(FORM_PERMISSION_KEYS.map((k) => [k, false]));
  if (!form || !loginId) return result;
  if (await isCompanyOwner(loginId, company_masters_id)) {
    return Object.fromEntries(FORM_PERMISSION_KEYS.map((k) => [k, true]));
  }
  const teamId = await loginTeamId(loginId);
  const Model = formBuilderFormPermissionModel(tenantDB);
  const rows = await Model.findAll({
    where: { form_id: form.id, company_masters_id, isDelete: 0, isActive: 1, ...targetWhere(loginId, teamId) },
    attributes: ["permission_key"],
    raw: true,
  });
  for (const r of rows) if (r.permission_key in result) result[r.permission_key] = true;
  return result;
}

// Users (logins of this company) and teams (departments) for the picker.
export async function listPermissionOptions({ company_masters_id, tenantDB }) {
  const links = await companyVsApplicationLoginModel.findAll({
    where: { company_masters_id, isDelete: 0 },
    attributes: ["a_application_login_id"],
    raw: true,
  });
  const ids = [...new Set(links.map((l) => l.a_application_login_id).filter((v) => v != null))];
  const logins = ids.length
    ? await loginModel.findAll({
        where: { id: ids, isDelete: 0 },
        attributes: ["id", "username", "department"],
        order: [["username", "ASC"]],
        raw: true,
      })
    : [];
  const Department = departmentModel(tenantDB);
  const departments = await Department.findAll({
    where: { isDelete: 0 },
    attributes: ["id", "department_name"],
    order: [["department_name", "ASC"]],
    raw: true,
  });
  return {
    users: logins.map((u) => ({
      a_application_login_id: u.id,
      name: u.username || `User #${u.id}`,
      team_id: Number(u.department) > 0 ? Number(u.department) : null,
    })),
    teams: departments.map((d) => ({ team_id: d.id, name: d.department_name || `Team #${d.id}` })),
  };
}

// Saved grants with a display name for each user / team.
export async function listFormPermissions({ form_id, company_masters_id, tenantDB }) {
  const Model = formBuilderFormPermissionModel(tenantDB);
  const rows = await Model.findAll({
    where: { form_id, company_masters_id, isDelete: 0 },
    attributes: ["permission_key", "a_application_login_id", "team_id"],
    order: [["id", "ASC"]],
    raw: true,
  });

  const loginIds = [...new Set(rows.map((r) => r.a_application_login_id).filter((v) => v != null))];
  const teamIds = [...new Set(rows.map((r) => r.team_id).filter((v) => v != null))];
  const loginNames = {};
  if (loginIds.length) {
    const logins = await loginModel.findAll({ where: { id: loginIds }, attributes: ["id", "username"], raw: true });
    for (const l of logins) loginNames[l.id] = l.username;
  }
  const teamNames = {};
  if (teamIds.length) {
    const teams = await departmentModel(tenantDB).findAll({
      where: { id: teamIds },
      attributes: ["id", "department_name", "isDelete"],
      raw: true,
    });
    for (const t of teams) teamNames[t.id] = Number(t.isDelete) ? `${t.department_name} (deleted)` : t.department_name;
  }

  return rows.map((r) => ({
    permission_key: r.permission_key,
    a_application_login_id: r.a_application_login_id,
    team_id: r.team_id,
    name:
      r.a_application_login_id != null
        ? loginNames[r.a_application_login_id] || "(removed user)"
        : teamNames[r.team_id] || "(deleted team)",
  }));
}

// Checks every grant target belongs to this company. Returns a plain
// message or null.
async function invalidTargetMessage({ grants, company_masters_id, tenantDB }) {
  const loginIds = [...new Set(grants.map((g) => g.a_application_login_id).filter((v) => v != null))];
  const teamIds = [...new Set(grants.map((g) => g.team_id).filter((v) => v != null))];
  if (loginIds.length) {
    const links = await companyVsApplicationLoginModel.findAll({
      where: { company_masters_id, a_application_login_id: loginIds, isDelete: 0 },
      attributes: ["a_application_login_id"],
      raw: true,
    });
    const found = new Set(links.map((l) => Number(l.a_application_login_id)));
    if (loginIds.some((id) => !found.has(Number(id)))) {
      return "One of the chosen users is not part of this company any more. Refresh the list and pick again.";
    }
  }
  if (teamIds.length) {
    const teams = await departmentModel(tenantDB).findAll({
      where: { id: teamIds, isDelete: 0 },
      attributes: ["id"],
      raw: true,
    });
    const found = new Set(teams.map((t) => Number(t.id)));
    if (teamIds.some((id) => !found.has(Number(id)))) {
      return "One of the chosen teams was deleted. Refresh the list and pick again.";
    }
  }
  return null;
}

// Mirrors setFormTeamRights: upsert-or-revive on grant, soft delete on
// removal. grants / removals already normalized by
// normalizePermissionChanges. Returns { error } for a bad target.
export async function saveFormPermissions({ form_id, company_masters_id, grants = [], removals = [], tenantDB }) {
  const message = await invalidTargetMessage({ grants, company_masters_id, tenantDB });
  if (message) return { error: message };

  const Model = formBuilderFormPermissionModel(tenantDB);
  for (const g of grants) {
    const where = {
      form_id,
      company_masters_id,
      permission_key: g.permission_key,
      a_application_login_id: g.a_application_login_id,
      team_id: g.team_id,
    };
    const existing = await Model.findOne({ where, order: [["id", "DESC"]] });
    if (existing) {
      if (Number(existing.isDelete) !== 0 || Number(existing.isActive) !== 1) {
        await existing.update({ isDelete: 0, isActive: 1 });
      }
    } else {
      await Model.create({ ...where, isDelete: 0, isActive: 1 });
    }
  }
  for (const r of removals) {
    await Model.update(
      { isDelete: 1 },
      {
        where: {
          form_id,
          company_masters_id,
          permission_key: r.permission_key,
          a_application_login_id: r.a_application_login_id,
          team_id: r.team_id,
          isDelete: 0,
        },
      },
    );
  }
  return {};
}
