import { QueryTypes } from "sequelize";
import companyVsWhatsappConfigModel from "../../../models/company_setup/companyVsWhatsappConfigModel.js";
import { pdfOrder } from "../../activities/orderServices.js";
import { contactAssignSendMessage, sendSalesPdfWhatsapp } from "../../whatsapp/whatsappService.js";
import { WHATSAPP_AXIOS } from "../../whatsapp/whatsappAxiosRegistry.js";
import { WHATSAPP_SEND_SALES_PDF_HANDLER } from "../../whatsapp/whatsappHandlerRegistry.js";
import { resolveTemplate } from "../context.js";
import { fetchUser, firstUserId } from "../records.js";
import { notifyUsers } from "../notify.js";
import { sendEmailAs } from "../senders/email.js";
import { nowIn, quietHoursEnd } from "../time.js";
import {
  actingUserId,
  logThirdParty,
  normalizeMobile,
  reqFor,
  requireId,
  resolveRecipient,
  targetId,
} from "./helpers.js";
import { THIRD_PARTY_LOG_INTEGRATION } from "../constants.js";

// A1 communication steps.

// Per-process per-minute counters for the WhatsApp limit (13.10).
const minuteCounts = new Map();
const minuteKey = (companyId) => `${companyId}|${Math.floor(Date.now() / 60000)}`;

const sentToday = async (run) => {
  const [row] = await run.tenantDB.query(
    "SELECT COUNT(*) AS c FROM `third_party_logs` WHERE `integration` = ? AND `company_masters_id` = ? " +
      "AND `module_name` LIKE ? AND `created_date_time` >= CURDATE()",
    { replacements: [THIRD_PARTY_LOG_INTEGRATION, run.company_masters_id, "%/ whatsapp%"], type: QueryTypes.SELECT }
  );
  return Number(row?.c || 0);
};

/** Returns a retry-wait result when quiet hours / limits say "not now". */
const whatsappGate = async (run) => {
  const s = run.settings || {};
  const quietEnd = quietHoursEnd(s);
  if (quietEnd) return { retry: true, output: { held_until: quietEnd.toDate(), reason: "Quiet hours" }, wait: { resume_at: quietEnd.toDate(), wait_type: "quiet_hours" } };
  if (s.wa_limit_per_minute) {
    const k = minuteKey(run.company_masters_id);
    if ((minuteCounts.get(k) || 0) >= s.wa_limit_per_minute) {
      const at = new Date(Math.ceil(Date.now() / 60000) * 60000 + 1000);
      return { retry: true, output: { held_until: at, reason: "Per-minute limit" }, wait: { resume_at: at, wait_type: "send_limit" } };
    }
  }
  if (s.wa_limit_per_day && (await sentToday(run)) >= s.wa_limit_per_day) {
    const at = nowIn(s).add(1, "day").startOf("day").add(9, "hours").toDate();
    return { retry: true, output: { held_until: at, reason: "Daily limit" }, wait: { resume_at: at, wait_type: "send_limit" } };
  }
  return null;
};

const countSend = (run) => {
  const k = minuteKey(run.company_masters_id);
  minuteCounts.set(k, (minuteCounts.get(k) || 0) + 1);
  if (minuteCounts.size > 5000) minuteCounts.clear();
};

const isOk = (res) => Number(res?.ack) === 1 || res?.success === true;

// A1.1 / A1.2 / A1.3 Send WhatsApp
// params: mode text|template|media, to contact|assigned_user|manager|run_as|number,
//         number, message, template_id, media_url, media_type image|document|video,
//         file_name, sender run_as|assigned_user|<user id>
export const send_whatsapp = async ({ ctx, params, run }) => {
  const mode = params.mode || "text";
  const number = normalizeMobile(await resolveRecipient(params.to || "contact", params.number, ctx, "whatsapp"));
  if (!number) throw new Error("No mobile number to send to");
  const senderId = actingUserId(params.sender, ctx, run);
  const text = resolveTemplate(params.message || "", ctx);
  const input = { mode, to: number, sender: senderId, text, template_id: params.template_id, media_url: params.media_url };
  if (run.is_test) return { input, output: { dry_run: true, would_send_to: number, text } };

  const gate = await whatsappGate(run);
  if (gate) return { input, ...gate };

  const started = Date.now();
  let res;
  if (mode === "media") {
    const config = await companyVsWhatsappConfigModel.findOne({ where: { company_id: run.company_masters_id }, raw: true });
    if (!config) throw new Error("WhatsApp is not configured for this company");
    const handler = WHATSAPP_SEND_SALES_PDF_HANDLER?.[config.configured_type]?.[config.plateform];
    if (!handler) throw new Error("This WhatsApp connection cannot send media");
    const mediaUrl = resolveTemplate(params.media_url, ctx);
    res = await handler({
      numbers: number,
      phone_number: number.slice(-10),
      sessionName: `a${senderId}_c${run.company_masters_id}`,
      mediaUrl,
      fileUrl: mediaUrl,
      fileName: resolveTemplate(params.file_name || "file", ctx),
      title: resolveTemplate(params.file_name || "file", ctx),
      messageText: text,
      message: text,
      messageType: params.media_type || "document",
      whatsapp_phone_number_id: config.whatsapp_phone_number_id,
      whatsapp_connection_id: config.whatsapp_connection_id,
      whatsapp_api_key: config.whatsapp_api_key,
      a_application_login_id: senderId,
      axios: WHATSAPP_AXIOS?.[config.configured_type]?.[config.plateform],
    });
  } else {
    res = await contactAssignSendMessage(reqFor(run, {}, senderId), {
      a_application_login_id: senderId,
      company_masters_id: run.company_masters_id,
      sessionName: `a${senderId}_c${run.company_masters_id}`,
      numbers: [number],
      text,
      template_id: mode === "template" ? params.template_id : null,
      customer_person_name: ctx.contact?.person_name,
      customer_company_name: ctx.contact?.company_name,
      customer_id: ctx.contact?.id,
    });
  }
  countSend(run);
  logThirdParty(run, {
    step: "whatsapp",
    direction: "OUTBOUND",
    url: `whatsapp:${mode}`,
    status: isOk(res) ? "SUCCESS" : "FAILED",
    response_time: Date.now() - started,
    request_payload: input,
    response_payload: res,
    error_message: isOk(res) ? null : res?.ack_msg || res?.developer_msg || "Send failed",
  });
  if (!isOk(res)) throw new Error(`WhatsApp not sent: ${res?.ack_msg || res?.developer_msg || "unknown error"}`);
  return { input, output: { sent: true, sent_to: number, mode } };
};

// A1.4 Send email
// params: to contact|assigned_user|manager|run_as|custom, email, cc, subject, body (HTML, {{ }}),
//         sender run_as|assigned_user|<user id>
export const send_email = async ({ ctx, params, run }) => {
  const to = await resolveRecipient(params.to || "contact", params.email, ctx, "email");
  if (!to) throw new Error("No email address to send to");
  const subject = resolveTemplate(params.subject || "", ctx);
  const html = resolveTemplate(params.body || "", ctx);
  const cc = resolveTemplate(params.cc || "", ctx) || null;
  const senderId = actingUserId(params.sender, ctx, run);
  const input = { to, cc, subject, sender: senderId };
  if (run.is_test) return { input, output: { dry_run: true, would_send_to: to, subject } };
  const sender = await fetchUser(senderId);
  const started = Date.now();
  try {
    const info = await sendEmailAs(sender, { to, cc, subject, html, attachments: params.__attachments });
    logThirdParty(run, { step: "email", direction: "OUTBOUND", url: `smtp:${sender?.host_out_going_mail}`, status: "SUCCESS", response_time: Date.now() - started, request_payload: input, response_payload: info });
    return { input, output: { sent: true, sent_to: to, message_id: info.message_id } };
  } catch (e) {
    logThirdParty(run, { step: "email", direction: "OUTBOUND", url: "smtp", status: "FAILED", response_time: Date.now() - started, request_payload: input, error_message: e.message });
    throw e;
  }
};

// A1.5 Send document PDF (quotation / order / invoice ...)
// params: cart_id (default: trigger document), channel whatsapp|email,
//         + send_email params when channel = email
export const send_document = async ({ ctx, params, run }) => {
  const cartId = requireId(targetId(resolveTemplate(params.cart_id, ctx), ctx, "cart"), "document");
  const senderId = actingUserId(params.sender, ctx, run);
  if (run.is_test) return { input: { cart_id: cartId, channel: params.channel }, output: { dry_run: true } };
  if ((params.channel || "whatsapp") === "whatsapp") {
    const gate = await whatsappGate(run);
    if (gate) return gate;
    const res = await sendSalesPdfWhatsapp(reqFor(run, { cart_id: cartId }, senderId));
    countSend(run);
    logThirdParty(run, { step: "whatsapp document", direction: "OUTBOUND", url: "sendSalesPdfWhatsapp", status: isOk(res) ? "SUCCESS" : "FAILED", request_payload: { cart_id: cartId }, response_payload: res });
    if (!isOk(res)) throw new Error(`Document not sent: ${res?.ack_msg || res?.developer_msg || "unknown error"}`);
    return { output: { sent: true, cart_id: cartId, channel: "whatsapp" } };
  }
  const pdf = await pdfOrder(reqFor(run, { cart_id: cartId }, senderId));
  if (Number(pdf?.ack) !== 1 || !pdf?.data?.path) throw new Error(`PDF not generated: ${pdf?.ack_msg || "unknown error"}`);
  const title = pdf.data.title || `document-${cartId}`;
  return send_email({
    ctx,
    run,
    params: { ...params, __attachments: [{ filename: `${title}.pdf`, path: pdf.data.path }] },
  });
};

// A1.6 In-app notification. params: users: [ids] | "assigned_user" | "run_as", title, body
export const notify = async ({ ctx, params, run }) => {
  const ids = [];
  for (const u of [].concat(params.users || [])) {
    if (u === "assigned_user") ids.push(ctx.assigned_user?.id);
    else if (u === "run_as") ids.push(run.run_as_user_id);
    else ids.push(Number(u));
  }
  const title = resolveTemplate(params.title || run.flow.name, ctx);
  const body = resolveTemplate(params.body || "", ctx);
  const userIds = ids.filter(Boolean);
  if (!userIds.length) throw new Error("No users to notify");
  if (run.is_test) return { output: { dry_run: true, users: userIds, title } };
  const reached = await notifyUsers(run.company_masters_id, userIds, {
    title,
    body,
    data: { flow_id: run.flow.id, record_type: ctx.record_type || "", record_id: ctx.record_id || "" },
  });
  return { output: { notified: reached, title } };
};

// A1.8 Notify manager / escalate: reporting member of the assigned user.
// params: title, body, also_whatsapp (bool), also_email (bool)
export const notify_manager = async ({ ctx, params, run }) => {
  const managerId = firstUserId(ctx.assigned_user?.reporting_member);
  if (!managerId) throw new Error("Assigned user has no reporting manager");
  const out = await notify({ ctx, run, params: { ...params, users: [managerId] } });
  if (params.also_whatsapp) await send_whatsapp({ ctx, run, params: { to: "manager", message: params.body } });
  if (params.also_email) await send_email({ ctx, run, params: { to: "manager", subject: params.title, body: params.body } });
  return { output: { ...out.output, manager_id: managerId } };
};
