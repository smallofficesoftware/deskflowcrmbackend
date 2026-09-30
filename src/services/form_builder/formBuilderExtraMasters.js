// Reference-field masters that aren't plain CRM tables (plan items E1, E2):
//   "user"          the team members of this company (id = a_application_login_id)
//   "custom:<id>"   a Form Builder custom list (Division, Department, Site...)
// formBuilderMasterRegistry.js hands these two masters over to this file, so
// the fill screens, the submissions list, Excel and PDF all resolve them the
// same way as any other Reference field.
import { QueryTypes } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { customListIdOf, isUserMaster } from "./formBuilderLookups.js";

async function companyUserRows(company_masters_id) {
  const links = await companyVsApplicationLoginModel.findAll({
    where: { company_masters_id, isDelete: 0 },
    attributes: ["a_application_login_id"],
    raw: true,
  });
  const ids = [...new Set(links.map((l) => l.a_application_login_id).filter((v) => v != null))];
  if (ids.length === 0) return [];
  return loginModel.findAll({
    where: { id: ids, isDelete: 0 },
    attributes: ["id", "username"],
    order: [["username", "ASC"]],
    raw: true,
  });
}

// Options for the fill screen's dropdown: [{ id, label }].
export async function getExtraMasterOptions({ tenantDB, master, company_masters_id }) {
  if (isUserMaster(master)) {
    if (company_masters_id == null) return [];
    const users = await companyUserRows(company_masters_id);
    return users.map((u) => ({ id: u.id, label: u.username || `User #${u.id}` }));
  }

  const listId = customListIdOf(master);
  if (listId == null) throw new Error(`formBuilderExtraMasters: unknown master "${master}"`);
  return tenantDB.query(
    `SELECT id, label FROM \`form_builder_custom_list_items\`
     WHERE list_id = :listId AND isDelete = 0
     ORDER BY display_order ASC, id ASC`,
    { replacements: { listId }, type: QueryTypes.SELECT },
  );
}

// id -> label for saved values. A removed user / list item keeps a readable
// label instead of going blank.
export async function resolveExtraMasterLabels({ tenantDB, master, ids }) {
  const uniqueIds = [...new Set((ids || []).filter((id) => id != null))];
  if (uniqueIds.length === 0) return {};

  const map = {};
  for (const id of uniqueIds) map[id] = "(deleted)";

  if (isUserMaster(master)) {
    const users = await loginModel.findAll({ where: { id: uniqueIds }, attributes: ["id", "username", "isDelete"], raw: true });
    for (const u of users) map[u.id] = u.username || `User #${u.id}`;
    return map;
  }

  const listId = customListIdOf(master);
  if (listId == null) throw new Error(`formBuilderExtraMasters: unknown master "${master}"`);
  const rows = await tenantDB.query(
    `SELECT id, label FROM \`form_builder_custom_list_items\` WHERE list_id = :listId AND id IN (:ids)`,
    { replacements: { listId, ids: uniqueIds }, type: QueryTypes.SELECT },
  );
  for (const row of rows) map[row.id] = row.label;
  return map;
}

// Customer (contact) labels for a customer-lookup field's saved contact ids.
export async function resolveCustomerLabels({ tenantDB, ids }) {
  const uniqueIds = [...new Set((ids || []).filter((id) => id != null))];
  if (uniqueIds.length === 0) return {};
  const rows = await tenantDB.query(
    `SELECT id, person_name, company_name, isDelete FROM \`contact_masters\` WHERE id IN (:ids)`,
    { replacements: { ids: uniqueIds }, type: QueryTypes.SELECT },
  );
  const map = {};
  for (const id of uniqueIds) map[id] = "(deleted)";
  for (const row of rows) {
    if (row.isDelete) continue;
    const name = (row.person_name || "").trim();
    const company = (row.company_name || "").trim();
    map[row.id] = name && company ? `${name} (${company})` : name || company || `Contact #${row.id}`;
  }
  return map;
}
