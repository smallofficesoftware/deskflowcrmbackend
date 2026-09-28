import moment from "moment";
import { Op } from "sequelize";
import { getTenantDB } from "../../config/dbManager.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// Manage Workspaces -> Manage Team: choose which employees of the Main Company are in a workspace.
// Adding maps the employee to the workspace and copies their rights from the Main Company (same as createWorkspace).
// Removing only switches the mapping off (isDelete = 1); the rights rows stay so a later re-add restores the setup.

const toIdList = (value) =>
  [...new Set((Array.isArray(value) ? value : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

/** Workspace + owner check. Returns { workspace, parentId } or { error }. */
const loadOwnedWorkspace = async (ownerId, workspace_id) => {
  const workspaceId = Number(workspace_id);
  if (!workspaceId) {
    return { error: resError({ ack_msg: "Workspace ID is required", developer_msg: "Required fields missing" }) };
  }
  const workspace = await companyModel.findOne({
    where: { id: workspaceId, isDelete: "0" },
    attributes: ["id", "parent_company_id"],
    raw: true,
  });
  if (!workspace || workspace.parent_company_id == null) {
    return { error: resError({ ack_msg: "Workspace not found", developer_msg: "Not a workspace of a main company" }) };
  }
  const ownerMapping = await companyVsApplicationLoginModel.findOne({
    where: {
      a_application_login_id: ownerId,
      company_masters_id: workspace.parent_company_id,
      company_flag: 1,
      isDelete: 0,
    },
    raw: true,
  });
  if (!ownerMapping) {
    return {
      error: resError({
        ack_msg: "Access denied: Only company owners can manage workspace team",
        developer_msg: "Access denied",
      }),
    };
  }
  return { workspace, parentId: workspace.parent_company_id };
};

const activeEmployeeIds = async (company_masters_id) =>
  (
    await companyVsApplicationLoginModel.findAll({
      where: { company_masters_id, company_flag: 2, isDelete: 0 },
      attributes: ["a_application_login_id"],
      raw: true,
    })
  ).map((r) => r.a_application_login_id);

/** Body { workspace_id } -> { employees: [{ id, username, recovery_mobile, in_workspace }] } (Main Company employees). */
export const getWorkspaceTeam = async (req) => {
  try {
    const { workspace, parentId, error } = await loadOwnedWorkspace(req.user.id, req.body?.workspace_id);
    if (error) return error;
    const [parentIds, workspaceIds] = await Promise.all([
      activeEmployeeIds(parentId),
      activeEmployeeIds(workspace.id),
    ]);
    const inWorkspace = new Set(workspaceIds);
    const logins = parentIds.length
      ? await loginModel.findAll({
          where: { id: { [Op.in]: parentIds }, isDelete: 0 },
          attributes: ["id", "username", "recovery_mobile"],
          raw: true,
        })
      : [];
    return resSuccess({
      data: {
        item: {
          employees: logins.map((l) => ({
            id: l.id,
            username: l.username,
            recovery_mobile: l.recovery_mobile,
            in_workspace: inWorkspace.has(l.id),
          })),
        },
      },
    });
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};

const parseRights = (raw) => {
  let parsed = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
    } catch (e) {
      // keep the raw value
    }
  }
  return parsed;
};

const copyMissingRights = async (ownerId, parentId, workspaceId, employeeId) => {
  const parentDb = await getTenantDB(ownerId, parentId);
  const childDb = await getTenantDB(ownerId, workspaceId);
  const parentRights = await applicationLoginTypeRightModel(parentDb.sequelize).findAll({
    where: { a_application_login_id: employeeId, isDelete: 0 },
  });
  if (!parentRights.length) return;
  const childModel = applicationLoginTypeRightModel(childDb.sequelize);
  const existing = new Set(
    (
      await childModel.findAll({
        where: { a_application_login_id: employeeId },
        attributes: ["page_id"],
        raw: true,
      })
    ).map((r) => r.page_id)
  );
  const now = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
  const rows = parentRights
    .filter((r) => !existing.has(r.dataValues.page_id))
    .map((r) => {
      const { id, ...data } = r.dataValues;
      return {
        ...data,
        a_page_id_rights_jason: parseRights(data.a_page_id_rights_jason),
        company_masters_id: workspaceId,
        created_date_time: now,
      };
    });
  if (rows.length) await childModel.bulkCreate(rows, { ignoreDuplicates: true });
};

/** Body { workspace_id, add_ids: [], remove_ids: [] } -> { added, removed }. */
export const updateWorkspaceTeam = async (req) => {
  try {
    const ownerId = req.user.id;
    const { workspace, parentId, error } = await loadOwnedWorkspace(ownerId, req.body?.workspace_id);
    if (error) return error;

    const parentEmployees = new Set(await activeEmployeeIds(parentId));
    const addIds = toIdList(req.body?.add_ids).filter((id) => parentEmployees.has(id));
    const removeIds = toIdList(req.body?.remove_ids).filter((id) => !addIds.includes(id));

    let added = 0;
    let rightsFailed = 0;
    for (const empId of addIds) {
      const mapping = await companyVsApplicationLoginModel.findOne({
        where: { company_masters_id: workspace.id, a_application_login_id: empId },
      });
      if (mapping?.company_flag === 1) continue;
      if (mapping) {
        if (mapping.isDelete === 0 && mapping.isActive === 1) continue;
        await mapping.update({ isDelete: 0, isActive: 1, company_flag: 2 });
      } else {
        await companyVsApplicationLoginModel.create({
          company_masters_id: workspace.id,
          company_flag: 2,
          a_application_login_id: empId,
        });
      }
      added += 1;
      try {
        await copyMissingRights(ownerId, parentId, workspace.id, empId);
      } catch (rightsErr) {
        rightsFailed += 1;
        console.error("[workspaceTeam] rights copy failed for", empId, rightsErr.message);
      }
    }

    let removed = 0;
    if (removeIds.length) {
      const [count] = await companyVsApplicationLoginModel.update(
        { isDelete: 1 },
        {
          where: {
            company_masters_id: workspace.id,
            company_flag: 2,
            isDelete: 0,
            a_application_login_id: { [Op.in]: removeIds },
          },
        }
      );
      removed = count;
    }

    return resSuccess({ ack_msg: "Workspace team updated", data: { item: { added, removed, rights_failed: rightsFailed } } });
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};
