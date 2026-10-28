import { Op } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { reminderMessagesModel } from "../../models/activities/reminderMessagesModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import { resBadRequest, resSuccess } from "../../utils/sharedFunctions.js";

// Moves everything assigned to a team member over to another one, so the
// member can then be deactivated without leaving orphaned assignments.
// Comma-separated assignee columns are rewritten token by token; the target
// is not added twice when they already hold the same record.

const hasToken = (csv, id) =>
  String(csv || "")
    .split(",")
    .some((v) => v.trim() === String(id));

const swapToken = (csv, fromId, toId) => {
  const out = [];
  for (const raw of String(csv || "").split(",")) {
    const v = raw.trim();
    if (!v) continue;
    const next = v === String(fromId) ? String(toId) : v;
    if (!out.includes(next)) out.push(next);
  }
  return out.join(",");
};

const reassignCsvColumn = async (Model, column, extraWhere, fromId, toId, transaction) => {
  const rows = await Model.findAll({
    where: { ...extraWhere, [column]: { [Op.like]: `%${fromId}%` } },
    attributes: ["id", column],
    raw: true,
    transaction,
  });
  let count = 0;
  for (const row of rows) {
    if (!hasToken(row[column], fromId)) continue;
    await Model.update({ [column]: swapToken(row[column], fromId, toId) }, { where: { id: row.id }, transaction });
    count += 1;
  }
  return count;
};

/** Body { from_id, to_id } -> { tasks, contacts, inquiries, reminders, reporting_members } */
export const reassignTeamMemberWork = async (req) => {
  const fromId = Number(req.body?.from_id);
  const toId = Number(req.body?.to_id);
  if (!Number.isInteger(fromId) || fromId <= 0 || !Number.isInteger(toId) || toId <= 0) {
    return resBadRequest({ ack_msg: "from_id and to_id are required" });
  }
  if (fromId === toId) return resBadRequest({ ack_msg: "Choose a different person" });

  const target = await loginModel.findOne({ where: { id: toId, isDelete: "0", isActive: 1 }, attributes: ["id"], raw: true });
  if (!target) return resBadRequest({ ack_msg: "Selected person is not active" });

  const t = await req.tenantDB.transaction();
  try {
    const tasks = await reassignCsvColumn(
      taskManagementModel(req.tenantDB), "assigned_team_member", { isDelete: 0, is_archive: 0 }, fromId, toId, t
    );
    const contacts = await reassignCsvColumn(
      contactModel(req.tenantDB), "assinged_to_work_a_application_id", { isDelete: 0 }, fromId, toId, t
    );
    const inquiries = await reassignCsvColumn(
      inquiryModel(req.tenantDB), "inquiry_assigned_team_member", { isDelete: 0 }, fromId, toId, t
    );
    const [reminders] = await reminderMessagesModel(req.tenantDB).update(
      { assigned_to: toId },
      { where: { assigned_to: fromId, isDelete: 0, completed_date_time: null }, transaction: t }
    );
    await t.commit();

    const [reportingMembers] = await loginModel.update(
      { reporting_member: toId },
      { where: { reporting_member: fromId, isDelete: "0", id: { [Op.ne]: toId } } }
    );

    return resSuccess({
      ack_msg: "Assignments moved",
      data: { item: { tasks, contacts, inquiries, reminders, reporting_members: reportingMembers } },
    });
  } catch (e) {
    await t.rollback();
    console.error("reassignTeamMemberWork error", e);
    return resBadRequest({ ack_msg: "Failed to move assignments", developer_msg: `error ${e}` });
  }
};
