import moment from "moment";
import { QueryTypes } from "sequelize";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import emitToCompany from "../1socketIOServices/emitToCompany.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getStorefrontAuthSettings } from "./storefrontAuthSettings.js";

// In-store chat. A storefront customer IS a contact_masters row, so chat lives in the CRM's existing
// contact_message_histories table - the same history the team already sees per contact - tagged
// entry_flag = 3 ("storefront chat"). Only entry_flag 3 rows are ever shown to the customer, so
// internal notes, WhatsApp and e-mail history on the same contact can never leak into the widget.
// message_side follows the CRM's own convention: 1 = our team, 2 = the customer.

const ENTRY_FLAG_STOREFRONT_CHAT = 3;
const SIDE_STORE = 1;
const SIDE_CUSTOMER = 2;
// contact_message_histories.description is a varchar(255) in the model.
const MAX_LENGTH = 255;
const MAX_PER_MINUTE = 15;
const PAGE = 200;

const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);

const shape = (r) => ({ id: r.id, from: Number(r.message_side) === SIDE_CUSTOMER ? "you" : "store", text: r.description || "", at: r.created_date_time });

const chatEnabled = async (db, companyId) => Boolean((await getStorefrontAuthSettings(db, companyId)).chat_enabled);

// ---------------------------------------------------------------- customer side (storefront session)

/** GET /storefront/me/chat?after=<id> - the customer's own thread (optionally only newer than `after`, for polling). */
export const getMyChat = async (req) => {
  try {
    const { contact_master_id, company_masters_id } = req.storefrontSession;
    if (!(await chatEnabled(req.tenantDB, company_masters_id))) return resError({ ack_msg: "Chat is not available." });
    const after = Number(req.query.after) || 0;

    const rows = await req.tenantDB.query(
      `SELECT id, message_side, description, created_date_time
         FROM contact_message_histories
        WHERE contact_masters_id = :contact AND company_masters_id = :company AND entry_flag = :flag AND isDelete = 0 AND id > :after
        ORDER BY id ASC
        LIMIT ${PAGE}`,
      { replacements: { contact: contact_master_id, company: company_masters_id, flag: ENTRY_FLAG_STOREFRONT_CHAT, after }, type: QueryTypes.SELECT }
    );
    return resSuccess({ data: { item: rows.map(shape) } });
  } catch (error) {
    return resError({ developer_msg: `getMyChat failed: ${error}` });
  }
};

/** POST /storefront/me/chat { message } */
export const sendMyChat = async (req) => {
  try {
    const { contact_master_id, company_masters_id, a_application_login_id } = req.storefrontSession;
    const db = req.tenantDB;
    if (!(await chatEnabled(db, company_masters_id))) return resError({ ack_msg: "Chat is not available." });

    const text = cleanText(req.body?.message);
    if (!text) return resBadRequest({ developer_msg: "message is required" });

    // Light flood guard - a customer can't spam the team's inbox.
    const [{ n }] = await db.query(
      `SELECT COUNT(*) AS n FROM contact_message_histories
        WHERE contact_masters_id = :contact AND entry_flag = :flag AND message_side = :side AND created_date_time > :since`,
      { replacements: { contact: contact_master_id, flag: ENTRY_FLAG_STOREFRONT_CHAT, side: SIDE_CUSTOMER, since: moment().subtract(1, "minute").format("YYYY-MM-DD HH:mm:ss") }, type: QueryTypes.SELECT }
    );
    if (Number(n) >= MAX_PER_MINUTE) return resError({ ack_msg: "You're sending messages too quickly. Please wait a moment." });

    const row = await contactMessageHistory(db).create({
      company_masters_id,
      a_application_login_id,
      contact_masters_id: contact_master_id,
      message_side: SIDE_CUSTOMER,
      entry_flag: ENTRY_FLAG_STOREFRONT_CHAT,
      description: text,
      created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
      isDelete: 0,
      isActive: 1,
    });

    try {
      emitToCompany(req.app.get("io"), company_masters_id, "storefront-chat-message", { contact_id: contact_master_id });
    } catch (e) {
      console.error("storefront chat emit failed", e); // never fail the send over a live-refresh signal
    }
    return resSuccess({ data: { item: shape(row.get({ plain: true })) } });
  } catch (error) {
    return resError({ developer_msg: `sendMyChat failed: ${error}` });
  }
};

// ---------------------------------------------------------------- CRM side (staff session)

/** POST /storefront/chat/threads - one row per customer who has chatted, newest first. needs_reply = last message is theirs. */
export const listChatThreads = async (req) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return resBadRequest({ ack_msg: "Company not found" });

    const rows = await req.tenantDB.query(
      `SELECT m.contact_masters_id AS contact_id, c.person_name, c.mobile_number, m.description, m.message_side, m.created_date_time
         FROM contact_message_histories m
         JOIN (SELECT contact_masters_id, MAX(id) AS last_id
                 FROM contact_message_histories
                WHERE company_masters_id = :company AND entry_flag = :flag AND isDelete = 0
                GROUP BY contact_masters_id) l ON l.last_id = m.id
         LEFT JOIN contact_masters c ON c.id = m.contact_masters_id
        ORDER BY m.id DESC
        LIMIT 100`,
      { replacements: { company: companyId, flag: ENTRY_FLAG_STOREFRONT_CHAT }, type: QueryTypes.SELECT }
    );
    return resSuccess({
      data: {
        item: rows.map((r) => ({
          contact_id: r.contact_id,
          name: r.person_name || r.mobile_number || `Customer #${r.contact_id}`,
          mobile: r.mobile_number || null,
          last_text: r.description || "",
          last_at: r.created_date_time,
          needs_reply: Number(r.message_side) === SIDE_CUSTOMER,
        })),
      },
    });
  } catch (error) {
    return resError({ developer_msg: `listChatThreads failed: ${error}` });
  }
};

/** POST /storefront/chat/messages { contact_id } */
export const getChatThread = async (req) => {
  try {
    const companyId = req.user?.companyId;
    const contactId = Number(req.body?.contact_id);
    if (!companyId || !contactId) return resBadRequest({ developer_msg: "contact_id is required" });

    const rows = await req.tenantDB.query(
      `SELECT id, message_side, description, created_date_time
         FROM contact_message_histories
        WHERE contact_masters_id = :contact AND company_masters_id = :company AND entry_flag = :flag AND isDelete = 0
        ORDER BY id ASC
        LIMIT ${PAGE}`,
      { replacements: { contact: contactId, company: companyId, flag: ENTRY_FLAG_STOREFRONT_CHAT }, type: QueryTypes.SELECT }
    );
    // From the team's point of view: "you" = us (side 1), "them" = the customer.
    return resSuccess({
      data: { item: rows.map((r) => ({ id: r.id, from: Number(r.message_side) === SIDE_STORE ? "us" : "them", text: r.description || "", at: r.created_date_time })) },
    });
  } catch (error) {
    return resError({ developer_msg: `getChatThread failed: ${error}` });
  }
};

/** POST /storefront/chat/reply { contact_id, message } */
export const replyToChat = async (req) => {
  try {
    const companyId = req.user?.companyId;
    const contactId = Number(req.body?.contact_id);
    const text = cleanText(req.body?.message);
    if (!companyId || !contactId || !text) return resBadRequest({ developer_msg: "contact_id and message are required" });

    // Only reply into a thread that exists - the CRM can't use this to write onto an arbitrary contact.
    const [existing] = await req.tenantDB.query(
      `SELECT id FROM contact_message_histories WHERE contact_masters_id = :contact AND company_masters_id = :company AND entry_flag = :flag LIMIT 1`,
      { replacements: { contact: contactId, company: companyId, flag: ENTRY_FLAG_STOREFRONT_CHAT }, type: QueryTypes.SELECT }
    );
    if (!existing) return resError({ ack_msg: "Chat not found" });

    const row = await contactMessageHistory(req.tenantDB).create({
      company_masters_id: companyId,
      a_application_login_id: req.body?.a_application_login_id || req.user?.a_application_login_id,
      application_login_name: req.body?.application_login_name,
      contact_masters_id: contactId,
      message_side: SIDE_STORE,
      entry_flag: ENTRY_FLAG_STOREFRONT_CHAT,
      description: text,
      created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
      isDelete: 0,
      isActive: 1,
    });
    return resSuccess({ data: { item: { id: row.id } } });
  } catch (error) {
    return resError({ developer_msg: `replyToChat failed: ${error}` });
  }
};
