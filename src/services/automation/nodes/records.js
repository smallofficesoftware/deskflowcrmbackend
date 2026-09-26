import { QueryTypes } from "sequelize";
import { insertStagesAndStatusLogs } from "../../commonServices.js";
import { covertOrderSystem } from "../../activities/orderServices.js";
import { createAllTask } from "../../activities/taskManagementServices.js";
import { resolveTemplate } from "../context.js";
import { fetchRowById, fetchUser } from "../records.js";
import { pickAssignee } from "./assign.js";
import {
  emitFromNode,
  fieldMap,
  nowSql,
  reqFor,
  requireId,
  resolved,
  safeColumns,
  targetId,
} from "./helpers.js";

// A2 contact, A3 inquiry, A4 documents, A5 task, A6 follow-up steps.
// Simple writes go straight to the tenant table and emit their own event
// (so other flows can chain). Writes with side effects (task create,
// document convert, status logs) call the existing service unchanged.

const IDENT = /^[a-z_][a-z0-9_]*$/i;

const insertRow = async (run, table, values) => {
  const cols = Object.keys(values).filter((k) => IDENT.test(k));
  const [id] = await run.tenantDB.query(
    `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    { replacements: cols.map((c) => values[c]), type: QueryTypes.INSERT }
  );
  return id;
};

const updateRow = async (run, table, id, values) => {
  const cols = Object.keys(values).filter((k) => IDENT.test(k));
  if (!cols.length) return;
  await run.tenantDB.query(
    `UPDATE \`${table}\` SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE \`id\` = ?`,
    { replacements: [...cols.map((c) => values[c]), id] }
  );
};

/** Update + emit "<type>.updated" with the before row (13.2). */
const updateAndEmit = async (run, table, recordType, id, values) => {
  const before = await fetchRowById(run.tenantDB, table, id);
  if (!before) throw new Error(`${recordType} #${id} not found`);
  if (Number(before.company_masters_id) && Number(before.company_masters_id) !== Number(run.company_masters_id)) {
    throw new Error(`${recordType} #${id} belongs to another company`);
  }
  if (run.is_test) return { before, after: { ...before, ...values }, dry_run: true };
  await updateRow(run, table, id, values);
  emitFromNode(run, `${recordType}.updated`, { id, before: [before] });
  return { before, after: { ...before, ...values } };
};

/** Status change through the existing status-log writer (keeps CRM history). */
const changeStatus = async (run, table, recordType, id, statusColumn, statusId) => {
  if (!statusId) throw new Error("Pick a status");
  const res = await updateAndEmit(run, table, recordType, id, { [statusColumn]: statusId });
  if (!run.is_test) {
    await insertStagesAndStatusLogs(reqFor(run), {
      reference_table: table,
      reference_id: id,
      status_id: statusId,
      a_application_login_id: run.run_as_user_id,
      inside_table_type: res.before?.type,
    });
  }
  return { id, from: res.before?.[statusColumn] ?? null, to: statusId };
};

const userName = async (id) => (await fetchUser(id))?.username || null;

// ---------------------------------------------------------------- A2 contact

// A2.1 params: fields [{ field, value }], on_duplicate use_existing|create
export const create_contact = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const values = safeColumns(fieldMap(p.fields));
  if (!values.person_name && !values.company_name) throw new Error("Contact needs a person or company name");
  if (values.mobile_number && (p.on_duplicate || "use_existing") === "use_existing") {
    const [dup] = await run.tenantDB.query(
      "SELECT * FROM `contact_masters` WHERE `isDelete` = 0 AND `company_masters_id` = ? AND `mobile_number` = ? LIMIT 1",
      { replacements: [run.company_masters_id, String(values.mobile_number)], type: QueryTypes.SELECT }
    );
    if (dup) {
      ctx.contact = dup;
      return { output: { contact_id: dup.id, existing: true, contact: dup } };
    }
  }
  if (run.is_test) return { output: { dry_run: true, would_create: values } };
  const id = await insertRow(run, "contact_masters", {
    ...values,
    company_masters_id: run.company_masters_id,
    a_application_login_id: run.run_as_user_id,
    created_date_time: nowSql(),
    isDelete: 0,
    isActive: 1,
  });
  const contact = await fetchRowById(run.tenantDB, "contact_masters", id);
  ctx.contact = contact;
  emitFromNode(run, "contact.created", { id });
  return { output: { contact_id: id, existing: false, contact } };
};

// A2.2 params: contact_id (optional), fields [{ field, value }]
export const update_contact = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const id = requireId(targetId(p.contact_id, ctx, "contact"), "contact");
  const values = safeColumns(fieldMap(p.fields), ["a_application_login_id"]);
  const res = await updateAndEmit(run, "contact_masters", "contact", id, values);
  return { output: { contact_id: id, updated: values, dry_run: !!res.dry_run } };
};

// A2.3 params: contact_id, status_id
export const change_contact_status = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const id = requireId(targetId(p.contact_id, ctx, "contact"), "contact");
  return { output: await changeStatus(run, "contact_masters", "contact", id, "contact_status", p.status_id) };
};

// A2.4 params: contact_id, mode user|round_robin|least_load, user_id, user_ids
export const assign_contact = async ({ ctx, params, run, node }) => {
  const id = requireId(targetId(resolveTemplate(params.contact_id, ctx), ctx, "contact"), "contact");
  const userId = await pickAssignee({ ctx, params, run, node, table: "contact_masters" });
  await updateAndEmit(run, "contact_masters", "contact", id, { assinged_to_work_a_application_id: String(userId) });
  return { output: { contact_id: id, assigned_user_id: userId, assigned_user_name: await userName(userId) } };
};

// A2.5 params: contact_id, action add|remove|set, label_ids [..]
export const contact_label = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const id = requireId(targetId(p.contact_id, ctx, "contact"), "contact");
  const row = await fetchRowById(run.tenantDB, "contact_masters", id);
  const current = String(row?.lable || "").split(",").map((s) => s.trim()).filter(Boolean);
  const picked = [].concat(p.label_ids || []).flatMap((s) => String(s).split(",")).map((s) => s.trim()).filter(Boolean);
  let next = current;
  if (p.action === "remove") next = current.filter((l) => !picked.includes(l));
  else if (p.action === "set") next = picked;
  else next = [...new Set([...current, ...picked])];
  await updateAndEmit(run, "contact_masters", "contact", id, { lable: next.join(",") });
  return { output: { contact_id: id, labels: next } };
};

// ---------------------------------------------------------------- A3 inquiry

// A3.1 params: contact_id, description, product_id, category_id, qty, source_type_id,
//              assigned_user_id, status_id, fields [{ field, value }]
export const create_inquiry = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const contactId = requireId(targetId(p.contact_id, ctx, "contact"), "contact");
  const values = {
    ...safeColumns(fieldMap(p.fields)),
    contact_master_id: contactId,
    description: p.description || "",
    product_id: p.product_id || null,
    category_id: p.category_id || null,
    qty: p.qty || null,
    source_type_id: p.source_type_id || ctx.contact?.source_type_id || null,
    inquiry_assigned_team_member: p.assigned_user_id ? String(p.assigned_user_id) : null,
    contact_status: p.status_id || null,
    inquiry_date_time: nowSql(),
    create_date_time: nowSql(),
    a_application_login_id: run.run_as_user_id,
    company_masters_id: run.company_masters_id,
    isDelete: 0,
    isActive: 1,
  };
  if (run.is_test) return { output: { dry_run: true, would_create: values } };
  const id = await insertRow(run, "inquiries", values);
  emitFromNode(run, "inquiry.created", { id });
  return { output: { inquiry_id: id, inquiry: await fetchRowById(run.tenantDB, "inquiries", id) } };
};

// A3.2 params: inquiry_id, fields [{ field, value }]
export const update_inquiry = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const id = requireId(targetId(p.inquiry_id, ctx, "inquiry"), "inquiry");
  const values = safeColumns(fieldMap(p.fields), ["a_application_login_id", "contact_master_id"]);
  await updateAndEmit(run, "inquiries", "inquiry", id, values);
  return { output: { inquiry_id: id, updated: values } };
};

// A3.3 params: inquiry_id, mode, user_id, user_ids
export const assign_inquiry = async ({ ctx, params, run, node }) => {
  const id = requireId(targetId(resolveTemplate(params.inquiry_id, ctx), ctx, "inquiry"), "inquiry");
  const userId = await pickAssignee({ ctx, params, run, node, table: "inquiries" });
  await updateAndEmit(run, "inquiries", "inquiry", id, { inquiry_assigned_team_member: String(userId) });
  return { output: { inquiry_id: id, assigned_user_id: userId, assigned_user_name: await userName(userId) } };
};

// A3.4 Won / lost / any stage. params: inquiry_id, status_id, reason (saved as a note)
export const change_inquiry_status = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const id = requireId(targetId(p.inquiry_id, ctx, "inquiry"), "inquiry");
  const out = await changeStatus(run, "inquiries", "inquiry", id, "contact_status", p.status_id);
  return { output: { ...out, reason: p.reason || null } };
};

// ---------------------------------------------------------------- A4 documents

// A4.1 Convert / copy an existing document through the CRM's own convert.
// params: cart_id (default trigger document), to_type (carts.type), mode convert|copy
export const convert_document = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const cartId = requireId(targetId(p.cart_id, ctx, "cart"), "document");
  const toType = Number(p.to_type);
  if (!toType) throw new Error("Pick the document type to create");
  const source = await fetchRowById(run.tenantDB, "carts", cartId);
  if (!source) throw new Error(`Document #${cartId} not found`);
  if (run.is_test) return { output: { dry_run: true, from: cartId, to_type: toType } };
  const res = await covertOrderSystem(
    reqFor(run, {
      cart_id: cartId,
      cart_type: toType,
      request_flag: p.mode === "copy" ? 2 : 1,
      reference_cart_number: source.cart_number,
      is_approve: p.is_approve ?? 1,
      multiConvert: 2,
    })
  );
  if (Number(res?.ack) !== 1) throw new Error(`Document not created: ${res?.ack_msg || res?.developer_msg || "unknown error"}`);
  const item = res?.data?.item;
  const newId = Number(Array.isArray(item) ? item[0]?.cart_id ?? item[0] : item?.cart_id ?? item) || null;
  return { output: { cart_id: newId, from_cart_id: cartId, to_type: toType } };
};

// A4.3 params: cart_id, status_id
export const change_document_status = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const id = requireId(targetId(p.cart_id, ctx, "cart"), "document");
  return { output: await changeStatus(run, "carts", "cart", id, "cart_status", p.status_id) };
};

// ---------------------------------------------------------------- A5 task

// A5.1 Create task through the existing createAllTask.
// params: title, remark, assigned_user_ids [..] | "assigned_user", priority (1-4),
//         start_in_minutes, due_in_hours, category_id, one_task_per_member (bool),
//         link_contact (bool, default true), is_support_ticket (bool)
export const create_task = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const members = [].concat(p.assigned_user_ids || [])
    .flatMap((x) => (x === "assigned_user" ? [ctx.assigned_user?.id] : String(x).split(",")))
    .map(Number)
    .filter(Boolean);
  if (!members.length) throw new Error("Pick who the task is for");
  const fmt = "DD-MM-YYYY hh:mm A";
  const moment = (await import("moment")).default;
  const from = moment().add(Number(p.start_in_minutes) || 0, "minutes");
  const to = from.clone().add(Number(p.due_in_hours) || 24, "hours");
  const body = {
    task_title: p.title || run.flow.name,
    task_remark: p.remark || "",
    assigned_team_member: members.join(","),
    team_task_assignement_type: p.one_task_per_member ? "2" : "1",
    task_priority: String(p.priority || 2),
    task_type: "5",
    task_fromdate: from.format(fmt),
    task_enddate: to.format(fmt),
    task_category_id: p.category_id || null,
    contact_masters_id: p.link_contact === false ? null : ctx.contact?.id || null,
    reference_id: ctx.record_id || null,
    reference_table: ctx.record_type ? { contact: "contact_masters", inquiry: "inquiries", cart: "carts" }[ctx.record_type] || null : null,
    is_support_ticket: p.is_support_ticket ? 1 : 0,
  };
  if (run.is_test) return { output: { dry_run: true, would_create: body } };
  const res = await createAllTask(reqFor(run, body));
  if (Number(res?.ack) !== 1) throw new Error(`Task not created: ${res?.ack_msg || res?.developer_msg || "unknown error"}`);
  const created = [].concat(res?.data?.item || []).map((t) => t?.id ?? t?.dataValues?.id).filter(Boolean);
  if (created.length) emitFromNode(run, "task.created", { ids: created });
  return { output: { task_id: created[0] || null, task_ids: created } };
};

// A5.2 params: task_id, fields [{ field, value }], status_id (optional)
export const update_task = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const id = requireId(targetId(p.task_id, ctx, "task"), "task");
  const values = safeColumns(fieldMap(p.fields), ["a_application_login_id"]);
  if (Object.keys(values).length) await updateAndEmit(run, "task_managements", "task", id, values);
  let status = null;
  if (p.status_id) status = await changeStatus(run, "task_managements", "task", id, "status", p.status_id);
  return { output: { task_id: id, updated: values, status } };
};

// A5.3 params: task_id, mode, user_id, user_ids
export const assign_task = async ({ ctx, params, run, node }) => {
  const id = requireId(targetId(resolveTemplate(params.task_id, ctx), ctx, "task"), "task");
  const userId = await pickAssignee({ ctx, params, run, node, table: "task_managements" });
  await updateAndEmit(run, "task_managements", "task", id, { assigned_team_member: String(userId) });
  return { output: { task_id: id, assigned_user_id: userId, assigned_user_name: await userName(userId) } };
};

// A5.4 params: task_id, comment
export const task_comment = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const id = requireId(targetId(p.task_id, ctx, "task") || Number(ctx.steps?.[p.from_step]?.task_id), "task");
  if (!p.comment) throw new Error("Comment is empty");
  if (run.is_test) return { output: { dry_run: true, task_id: id } };
  const user = await fetchUser(run.run_as_user_id);
  const commentId = await insertRow(run, "task_message_histories", {
    description: p.comment,
    task_id: id,
    company_masters_id: run.company_masters_id,
    message_side: 1,
    message_type_id: 0,
    a_application_login_id: run.run_as_user_id,
    application_login_name: user?.username || "Automation",
    created_date_time: nowSql(),
    isDelete: 0,
    isActive: 1,
  });
  return { output: { task_id: id, comment_id: commentId } };
};

// ---------------------------------------------------------------- A6 follow-up

// A6.1 params: contact_id, remark, in_amount + in_unit (minutes|hours|days) or at, assigned_to (user id | "assigned_user")
export const create_reminder = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const moment = (await import("moment")).default;
  const contactId = targetId(p.contact_id, ctx, "contact");
  const at = p.at ? moment(p.at) : moment().add(Number(p.in_amount) || 1, p.in_unit || "days");
  if (!at.isValid()) throw new Error("Reminder date is not valid");
  const assignedTo = p.assigned_to === "assigned_user" ? ctx.assigned_user?.id : Number(p.assigned_to) || run.run_as_user_id;
  const values = {
    company_masters_id: run.company_masters_id,
    a_application_login_id: run.run_as_user_id,
    assigned_to: assignedTo,
    assigned_to_name: await userName(assignedTo),
    contact_masters_id: contactId || null,
    reference_id: ctx.record_id || null,
    reference_table: ctx.record_type ? { contact: "contact_masters", inquiry: "inquiries", cart: "carts", task: "task_managements" }[ctx.record_type] || null : null,
    reminder_data_time: at.format("YYYY-MM-DD HH:mm:ss"),
    remark: p.remark || "",
    create_date_time: nowSql(),
    isDelete: 0,
    isActive: 1,
  };
  if (run.is_test) return { output: { dry_run: true, would_create: values } };
  const id = await insertRow(run, "reminder_messages", values);
  return { output: { reminder_id: id, reminder_at: values.reminder_data_time } };
};

// A6.3 Log a note on the contact's timeline. params: contact_id, note
export const log_note = async ({ ctx, params, run }) => {
  const p = resolved(params, ctx);
  const contactId = requireId(targetId(p.contact_id, ctx, "contact"), "contact");
  if (!p.note) throw new Error("Note is empty");
  if (run.is_test) return { output: { dry_run: true, contact_id: contactId } };
  const user = await fetchUser(run.run_as_user_id);
  const id = await insertRow(run, "contact_message_histories", {
    description: p.note,
    contact_masters_id: contactId,
    company_masters_id: run.company_masters_id,
    message_side: 1,
    message_type_id: 0,
    a_application_login_id: run.run_as_user_id,
    application_login_name: user?.username || "Automation",
    created_date_time: nowSql(),
    isDelete: 0,
    isActive: 1,
  });
  return { output: { note_id: id, contact_id: contactId } };
};
