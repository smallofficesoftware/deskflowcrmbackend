import { Op } from "sequelize";
import { contactModel } from "../../models/activities/contactModel.js";
import loginModel from "../../models/application_login/loginModel.js";

/**
 * The team member(s) assigned to a customer contact, for the document's "Assigned Person" and
 * "Assigned Person Mobile" fields. Several assignees are joined with ", ", in the same order, so the
 * n-th name matches the n-th mobile number. Returns empty strings when the contact has no assignee,
 * so the fields stay hidden.
 */
export async function getAssignedPersonDetails(tenantDB, contactId) {
  const empty = { assignedPerson: "", assignedPersonMobile: "" };
  const id = Number(contactId);
  if (!tenantDB || !Number.isInteger(id) || id <= 0) return empty;

  const contact = await contactModel(tenantDB).findOne({
    where: { id, isDelete: 0 },
    attributes: ["assinged_to_work_a_application_id"],
    raw: true,
  });
  const ids = String(contact?.assinged_to_work_a_application_id ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return empty;

  const users = await loginModel.findAll({
    where: { id: { [Op.in]: ids }, isDelete: 0 },
    attributes: ["id", "username", "recovery_mobile"],
    raw: true,
  });
  const byId = new Map(users.map((u) => [Number(u.id), u]));
  const ordered = ids.map((assignedId) => byId.get(assignedId)).filter(Boolean);

  return {
    assignedPerson: ordered.map((u) => u.username).filter(Boolean).join(", "),
    assignedPersonMobile: ordered.map((u) => u.recovery_mobile).filter(Boolean).join(", "),
  };
}
