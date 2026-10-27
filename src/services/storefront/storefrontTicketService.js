import moment from "moment";
import Sequelize, { Op, QueryTypes } from "sequelize";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import { taskMessageHistroyModel } from "../../models/activities/taskMessageHistroyModel.js";
import emitToCompany from "../1socketIOServices/emitToCompany.js";
import loginModel from "../../models/application_login/loginModel.js";
import { getStorefrontAuthSettings } from "./storefrontAuthSettings.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// Support tickets for a logged-in storefront customer. A ticket is the CRM's own support-ticket task
// (task_managements.is_support_ticket = 1), so the team handles it in the normal Tickets module - the
// storefront only creates/reads them. Same field values the existing public store-ticket flow
// (services/online-store/supportTicketService.js) already writes.
//
// Visibility: task_message_histories.message_side 1 = internal team chat, 2 = customer-facing. The
// customer is only ever shown side 2, and only for tickets whose contact is the logged-in customer.

const MAX_TITLE = 150;
const MAX_TEXT = 2000;
const MAX_TICKETS = 100;
const MAX_MESSAGES = 200;

// Admin-configurable (storefront settings -> Support tickets). Every customer-facing ticket call goes through this.
const ticketSettings = async (req, companyId) => {
  const s = await getStorefrontAuthSettings(req.tenantDB, companyId);
  const ids = Array.isArray(s.ticket_category_ids) ? s.ticket_category_ids.map(Number).filter(Number.isInteger) : [];
  const initial = Number(s.ticket_initial_status_id);
  return {
    enabled: s.tickets_enabled !== false,
    categoryIds: ids,
    categoryRequired: Boolean(s.ticket_category_required),
    assigneeId: Number(s.ticket_default_assignee_id) || null,
    priority: Number(s.ticket_default_priority) || 4,
    initialStatus: s.ticket_initial_status_id !== null && Number.isInteger(initial) ? initial : -14,
    replyEnabled: s.ticket_customer_reply_enabled !== false,
  };
};
const DISABLED = () => resError({ ack_msg: "Support tickets are not available." });

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** GET /storefront/me/tickets/categories - the ticket categories the store exposes to customers. */
export const getTicketCategories = async (req) => {
  try {
    const cfg = await ticketSettings(req, req.storefrontSession.company_masters_id);
    if (!cfg.enabled) return DISABLED();
    const rows = await req.tenantDB.query(
      `SELECT id, task_category_name AS name FROM task_categories WHERE isDelete = 0 AND visibility = 1 ORDER BY id ASC`,
      { type: QueryTypes.SELECT }
    );
    const allowed = cfg.categoryIds.length ? rows.filter((r) => cfg.categoryIds.includes(Number(r.id))) : rows;
    return resSuccess({ data: { item: allowed, category_required: cfg.categoryRequired } });
  } catch (error) {
    return resError({ developer_msg: `getTicketCategories failed: ${error}` });
  }
};

/** GET /storefront/me/tickets - the customer's own tickets, newest first, with their customer-facing status. */
export const getMyTickets = async (req) => {
  try {
    const { contact_master_id, company_masters_id } = req.storefrontSession;
    if (!(await ticketSettings(req, company_masters_id)).enabled) return DISABLED();
    const rows = await req.tenantDB.query(
      `SELECT t.id, t.task_title, t.created_date_time, t.external_status, s.name AS status_name, s.color AS status_color,
              c.task_category_name AS category
         FROM task_managements t
         LEFT JOIN stage_status_masters s ON s.id = t.external_status AND s.isDelete = 0
         LEFT JOIN task_categories c ON c.id = t.task_category_id
        WHERE t.contact_masters_id = :contact AND t.company_masters_id = :company AND t.is_support_ticket = 1 AND t.isDelete = 0
        ORDER BY t.id DESC
        LIMIT ${MAX_TICKETS}`,
      { replacements: { contact: contact_master_id, company: company_masters_id }, type: QueryTypes.SELECT }
    );
    return resSuccess({
      data: {
        item: rows.map((r) => ({
          id: r.id,
          title: r.task_title,
          created_at: r.created_date_time,
          status: r.status_name || "Open",
          status_color: r.status_color || null,
          category: r.category || null,
        })),
      },
    });
  } catch (error) {
    return resError({ developer_msg: `getMyTickets failed: ${error}` });
  }
};

/** POST /storefront/me/tickets { title, description, category_id } */
export const createMyTicket = async (req) => {
  try {
    const { contact_master_id, company_masters_id, a_application_login_id } = req.storefrontSession;
    const db = req.tenantDB;
    const title = clean(req.body?.title, MAX_TITLE);
    const description = clean(req.body?.description, MAX_TEXT);
    const categoryId = Number(req.body?.category_id) || null;
    if (!title || !description) return resBadRequest({ developer_msg: "title and description are required" });

    const cfg = await ticketSettings(req, company_masters_id);
    if (!cfg.enabled) return DISABLED();
    if (cfg.categoryRequired && !categoryId) return resBadRequest({ ack_msg: "Please choose a category." });
    if (categoryId) {
      const [ok] = await db.query(`SELECT id FROM task_categories WHERE id = :id AND isDelete = 0 AND visibility = 1`, {
        replacements: { id: categoryId },
        type: QueryTypes.SELECT,
      });
      if (!ok || (cfg.categoryIds.length && !cfg.categoryIds.includes(categoryId))) return resBadRequest({ ack_msg: "Please choose a valid category." });
    }

    const [contact] = await db.query(`SELECT person_name, mobile_number FROM contact_masters WHERE id = :id AND isDelete = 0`, {
      replacements: { id: contact_master_id },
      type: QueryTypes.SELECT,
    });
    if (!contact) return resError({ ack_msg: "Account not found." });

    const now = moment();
    const created = now.format("YYYY-MM-DD HH:mm:ss");
    const task = await taskManagementModel(db).create({
      task_title: title,
      task_remark: escapeHtml(description),
      is_support_ticket: 1,
      task_fromdate: moment(now).startOf("day").format("YYYY-MM-DD HH:mm:ss"),
      task_enddate: moment(now).endOf("day").format("YYYY-MM-DD HH:mm:ss"),
      contact_masters_id: contact_master_id,
      // Configured assignee, else the company's own login (what the existing public store-ticket flow uses).
      assigned_team_member: cfg.assigneeId || a_application_login_id,
      a_application_login_id,
      company_masters_id,
      created_date_time: created,
      task_type: 5,
      task_priority: cfg.priority,
      task_category_id: categoryId,
      status: 0,
      external_status: cfg.initialStatus,
      team_task_assignement_type: 1,
      task_attechment: "",
    });

    await taskMessageHistroyModel(db).create({
      task_id: task.id,
      a_application_login_id,
      company_masters_id,
      description: `<strong>Support Ticket Created</strong><br><strong>Issue Title:</strong> ${escapeHtml(title)}<br><strong>Issue Remark:</strong> ${escapeHtml(description)}<br><strong>Raised from:</strong> Online store`,
      created_date_time: created,
      message_side: 2,
      message_type_id: 0,
      application_login_name: contact.person_name || contact.mobile_number || "Customer",
    });

    try {
      emitToCompany(req.app.get("io"), company_masters_id, "storefront-chat-message", { ticket_id: task.id });
    } catch (e) {
      console.error("storefront ticket emit failed", e);
    }
    return resSuccess({ data: { item: { id: task.id } }, ack_msg: "Support ticket created" });
  } catch (error) {
    return resError({ developer_msg: `createMyTicket failed: ${error}` });
  }
};

// The ticket must belong to the logged-in customer - anyone else's id finds nothing.
const ownTicket = async (db, id, contactId, companyId) => {
  const [t] = await db.query(
    `SELECT t.id, t.task_title, t.task_remark, t.created_date_time, s.name AS status_name, s.color AS status_color
       FROM task_managements t
       LEFT JOIN stage_status_masters s ON s.id = t.external_status AND s.isDelete = 0
      WHERE t.id = :id AND t.contact_masters_id = :contact AND t.company_masters_id = :company AND t.is_support_ticket = 1 AND t.isDelete = 0
      LIMIT 1`,
    { replacements: { id, contact: contactId, company: companyId }, type: QueryTypes.SELECT }
  );
  return t || null;
};

/** GET /storefront/me/tickets/:id - the ticket and its customer-facing messages. */
export const getMyTicket = async (req) => {
  try {
    const { contact_master_id, company_masters_id } = req.storefrontSession;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return resError({ ack_msg: "Ticket not found" });
    const cfg = await ticketSettings(req, company_masters_id);
    if (!cfg.enabled) return DISABLED();
    const ticket = await ownTicket(req.tenantDB, id, contact_master_id, company_masters_id);
    if (!ticket) return resError({ ack_msg: "Ticket not found" });

    const messages = await req.tenantDB.query(
      `SELECT id, description, created_date_time, application_login_name, media_url
         FROM task_message_histories
        WHERE task_id = :id AND message_side = 2 AND isDelete = 0
        ORDER BY id ASC
        LIMIT ${MAX_MESSAGES}`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    return resSuccess({
      data: {
        item: {
          id: ticket.id,
          title: ticket.task_title,
          created_at: ticket.created_date_time,
          status: ticket.status_name || "Open",
          status_color: ticket.status_color || null,
          can_reply: cfg.replyEnabled,
          messages: messages.map((m) => ({
            id: m.id,
            // Message bodies are CRM HTML ("<strong>..</strong><br>"). The storefront shows plain text, so tags are stripped here.
            text: String(m.description || "")
              .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
              .replace(/<[^>]*>/g, "")
              .replace(/&nbsp;/g, " ")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&amp;/g, "&")
              .replace(/\n{3,}/g, "\n\n")
              .trim(),
            author: m.application_login_name || null,
            at: m.created_date_time,
          })),
        },
      },
    });
  } catch (error) {
    return resError({ developer_msg: `getMyTicket failed: ${error}` });
  }
};

/** POST /storefront/me/tickets/:id/messages { message } */
export const replyMyTicket = async (req) => {
  try {
    const { contact_master_id, company_masters_id, a_application_login_id } = req.storefrontSession;
    const id = Number(req.params.id);
    const text = clean(req.body?.message, MAX_TEXT);
    if (!Number.isInteger(id) || !text) return resBadRequest({ developer_msg: "message is required" });
    const cfg = await ticketSettings(req, company_masters_id);
    if (!cfg.enabled) return DISABLED();
    if (!cfg.replyEnabled) return resError({ ack_msg: "Replies are turned off for support tickets." });
    const ticket = await ownTicket(req.tenantDB, id, contact_master_id, company_masters_id);
    if (!ticket) return resError({ ack_msg: "Ticket not found" });

    const [contact] = await req.tenantDB.query(`SELECT person_name, mobile_number FROM contact_masters WHERE id = :id`, {
      replacements: { id: contact_master_id },
      type: QueryTypes.SELECT,
    });
    await taskMessageHistroyModel(req.tenantDB).create({
      task_id: id,
      a_application_login_id,
      company_masters_id,
      description: escapeHtml(text),
      created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
      message_side: 2,
      message_type_id: 0,
      is_reminder: 0,
      application_login_name: contact?.person_name || contact?.mobile_number || "Customer",
    });
    return resSuccess({ data: { item: { ok: true } } });
  } catch (error) {
    return resError({ developer_msg: `replyMyTicket failed: ${error}` });
  }
};

/** POST /storefront/tickets/options (CRM) - what the settings page offers: ticket categories, customer-facing
 * ticket statuses (stage status order_type 8, visibility 1) and the company's team members. */
export const getTicketOptions = async (req) => {
  try {
    const companyId = Number(req.user?.companyId);
    if (!companyId) return resBadRequest({ ack_msg: "Company not found" });
    const [categories, statuses, members] = await Promise.all([
      req.tenantDB.query(`SELECT id, task_category_name AS name FROM task_categories WHERE isDelete = 0 AND visibility = 1 ORDER BY id ASC`, { type: QueryTypes.SELECT }),
      req.tenantDB.query(`SELECT id, name FROM stage_status_masters WHERE order_type = 8 AND visibility = 1 AND isDelete = 0 ORDER BY id DESC`, { type: QueryTypes.SELECT }),
      loginModel.findAll({
        where: {
          isDelete: 0,
          id: { [Op.in]: Sequelize.literal(`(SELECT a_application_login_id FROM company_vs_application_logins WHERE isDelete = 0 AND company_masters_id = ${companyId})`) },
        },
        attributes: ["id", "username"],
        raw: true,
      }),
    ]);
    return resSuccess({ data: { item: { categories, statuses, members: members.map((m) => ({ id: m.id, name: m.username })) } } });
  } catch (error) {
    return resError({ developer_msg: `getTicketOptions failed: ${error}` });
  }
};
