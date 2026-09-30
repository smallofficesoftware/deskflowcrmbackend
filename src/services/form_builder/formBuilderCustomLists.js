// Form Builder custom lists (plan item E1): reusable pick-lists such as
// Division / Department / Site / Project that a company builds itself, used
// by Reference fields as master "custom:<list id>".
//
//   POST /form-builder/custom-lists/list    -> { items: [{ id, name, items: [{ id, label }] }] }
//   POST /form-builder/custom-lists/save    { id?, name, items: [{ id?, label }] }
//   POST /form-builder/custom-lists/delete  { id }
//
// Listing is open to anyone who can open Form Builder; changing or deleting
// a list needs the same add/edit right as building forms.
import { QueryTypes } from "sequelize";
import { formBuilderCustomListModel, formBuilderCustomListItemModel } from "../../models/form_builder/formBuilderCustomListModel.js";
import { resolveFormBuilderRights } from "./formBuilderRights.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";
import { logAuditEvent } from "../company_setup/auditLogServices.js";

const MODULE_KEY = "form_builder";
const ENTITY_TYPE_CUSTOM_LIST = "form_builder_custom_list";
const NAME_MAX = 100;
const LABEL_MAX = 150;
const ITEMS_MAX = 500;

async function loadContext(req, { needsChange = false } = {}) {
  const a_application_login_id = req.body?.a_application_login_id;
  const company = await getCompanyByLoginId(a_application_login_id);
  if (!company) return { error: resError({ ack_msg: "Company not found for login ID" }) };
  const company_masters_id = company.company_masters_id;
  const rights = await resolveFormBuilderRights({ company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
  const allowed = needsChange ? rights.isOwner || rights.canAdd || rights.canEdit : rights.isOwner || rights.canView || rights.canAdd || rights.canEdit;
  if (!allowed) {
    return { error: resError({ code: 403, ack_msg: needsChange ? "You don't have permission to change lists" : "You don't have permission to see lists" }) };
  }
  return { a_application_login_id, company_masters_id };
}

// Trim, drop blanks, reject too-long / duplicate labels (case-insensitive).
// Returns { items } or { error }.
export function cleanListItems(rawItems) {
  const list = Array.isArray(rawItems) ? rawItems : [];
  const items = [];
  const seen = new Set();
  for (const raw of list) {
    const label = String(raw?.label ?? "").trim();
    if (!label) continue;
    if (label.length > LABEL_MAX) return { error: `“${label.slice(0, 30)}…” is too long (at most ${LABEL_MAX} characters).` };
    const norm = label.toLowerCase();
    if (seen.has(norm)) return { error: `“${label}” is in the list twice. Remove one of them.` };
    seen.add(norm);
    const id = Number(raw?.id);
    items.push({ id: Number.isInteger(id) && id > 0 ? id : null, label });
  }
  if (items.length === 0) return { error: "Add at least one item to the list." };
  if (items.length > ITEMS_MAX) return { error: `A list can have at most ${ITEMS_MAX} items.` };
  return { items };
}

async function loadListsWithItems(tenantDB, company_masters_id) {
  const List = formBuilderCustomListModel(tenantDB);
  const Item = formBuilderCustomListItemModel(tenantDB);
  const lists = await List.findAll({ where: { company_masters_id, isDelete: 0 }, order: [["name", "ASC"]], raw: true });
  const listIds = lists.map((l) => l.id);
  const items = listIds.length
    ? await Item.findAll({ where: { list_id: listIds, isDelete: 0 }, order: [["display_order", "ASC"], ["id", "ASC"]], raw: true })
    : [];
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    items: items.filter((i) => i.list_id === l.id).map((i) => ({ id: i.id, label: i.label })),
  }));
}

export const listCustomLists = async (req) => {
  try {
    const { company_masters_id, error } = await loadContext(req);
    if (error) return error;
    return resSuccess({ data: { items: await loadListsWithItems(req.tenantDB, company_masters_id) } });
  } catch (e) {
    console.error("listCustomLists error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const saveCustomList = async (req) => {
  try {
    const { a_application_login_id, company_masters_id, error } = await loadContext(req, { needsChange: true });
    if (error) return error;

    const { id, name, items: rawItems } = req.body || {};
    const cleanName = String(name ?? "").trim();
    if (!cleanName) return resError({ ack_msg: "Give the list a name, for example “Division”." });
    if (cleanName.length > NAME_MAX) return resError({ ack_msg: `The list name can be at most ${NAME_MAX} characters.` });
    const cleaned = cleanListItems(rawItems);
    if (cleaned.error) return resError({ ack_msg: cleaned.error });

    const List = formBuilderCustomListModel(req.tenantDB);
    const Item = formBuilderCustomListItemModel(req.tenantDB);

    const sameName = await List.findOne({ where: { company_masters_id, isDelete: 0, name: cleanName }, raw: true });
    if (sameName && String(sameName.id) !== String(id)) {
      return resError({ ack_msg: `You already have a list called “${cleanName}”.` });
    }

    let list;
    if (id) {
      list = await List.findOne({ where: { id, company_masters_id, isDelete: 0 } });
      if (!list) return resError({ ack_msg: "List not found" });
    }

    const savedId = await req.tenantDB.transaction(async (transaction) => {
      if (list) await list.update({ name: cleanName }, { transaction });
      else {
        list = await List.create(
          { company_masters_id, name: cleanName, created_by_a_application_login_id: a_application_login_id, created_date_time: new Date() },
          { transaction },
        );
      }

      const existing = await Item.findAll({ where: { list_id: list.id, isDelete: 0 }, transaction });
      const existingById = new Map(existing.map((i) => [i.id, i]));
      const keptIds = new Set();
      let order = 0;
      for (const item of cleaned.items) {
        order += 1;
        const current = item.id ? existingById.get(item.id) : null;
        if (current) {
          keptIds.add(current.id);
          await current.update({ label: item.label, display_order: order }, { transaction });
        } else {
          await Item.create(
            { company_masters_id, list_id: list.id, label: item.label, display_order: order, created_date_time: new Date() },
            { transaction },
          );
        }
      }
      // Items taken out of the list are soft-deleted, so entries that
      // already used them still show their old label.
      for (const old of existing) {
        if (!keptIds.has(old.id)) await old.update({ isDelete: 1 }, { transaction });
      }
      return list.id;
    });

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: id ? "update_custom_list" : "create_custom_list",
      entity_type: ENTITY_TYPE_CUSTOM_LIST,
      entity_id: savedId,
      details: { name: cleanName, item_count: cleaned.items.length },
    });

    const lists = await loadListsWithItems(req.tenantDB, company_masters_id);
    return resSuccess({ ack_msg: "List saved", data: { item: lists.find((l) => l.id === savedId), items: lists } });
  } catch (e) {
    console.error("saveCustomList error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteCustomList = async (req) => {
  try {
    const { company_masters_id, error } = await loadContext(req, { needsChange: true });
    if (error) return error;

    const { id } = req.body || {};
    const List = formBuilderCustomListModel(req.tenantDB);
    const list = await List.findOne({ where: { id, company_masters_id, isDelete: 0 } });
    if (!list) return resError({ ack_msg: "List not found" });

    // A list still used by a form (draft or published) can't be removed —
    // the form would lose its dropdown.
    const marker = `%custom:${list.id}"%`;
    const usedBy = await req.tenantDB.query(
      `SELECT title FROM \`form_builder_forms\`
       WHERE company_masters_id = :company_masters_id AND isDelete = 0
         AND (schema_json LIKE :marker OR published_schema_json LIKE :marker)`,
      { replacements: { company_masters_id, marker }, type: QueryTypes.SELECT },
    );
    if (usedBy.length > 0) {
      const names = usedBy.slice(0, 3).map((f) => `“${f.title}”`).join(", ");
      return resError({ ack_msg: `“${list.name}” is used by ${names}${usedBy.length > 3 ? " and others" : ""}. Change those forms first, then delete the list.` });
    }

    await list.update({ isDelete: 1 });
    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "delete_custom_list",
      entity_type: ENTITY_TYPE_CUSTOM_LIST,
      entity_id: list.id,
      details: { name: list.name },
    });
    const lists = await loadListsWithItems(req.tenantDB, company_masters_id);
    return resSuccess({ ack_msg: "List deleted", data: { items: lists } });
  } catch (e) {
    console.error("deleteCustomList error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Live ids of this company's lists — used by the publish check.
export async function getExistingCustomListIds(tenantDB, company_masters_id) {
  const rows = await formBuilderCustomListModel(tenantDB).findAll({
    where: { company_masters_id, isDelete: 0 },
    attributes: ["id"],
    raw: true,
  });
  return new Set(rows.map((r) => r.id));
}
