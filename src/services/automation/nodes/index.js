import * as records from "./records.js";
import * as http from "./http.js";
import * as logic from "./logic.js";
import * as messaging from "./messaging.js";

// Node type -> handler. A handler receives { ctx, params, node, run } and
// returns { output, handle?, wait?, stop?, retry?, input? }.
//   handle  which wire fires next (default "src")
//   wait    { resume_at, wait_type }  park the run, scheduler resumes it
//   stop    end the run successfully
//   retry   run this same step again after `wait` (quiet hours / send limit)

export const NODE_HANDLERS = {
  trigger: logic.trigger,
  condition: logic.condition,
  if_else: logic.if_else,
  wait: logic.wait,
  wait_until: logic.wait_until,
  stop: logic.stop,
  set_variable: logic.set_variable,

  send_whatsapp: messaging.send_whatsapp,
  send_email: messaging.send_email,
  send_document: messaging.send_document,
  notify: messaging.notify,
  notify_manager: messaging.notify_manager,

  create_contact: records.create_contact,
  update_contact: records.update_contact,
  change_contact_status: records.change_contact_status,
  assign_contact: records.assign_contact,
  contact_label: records.contact_label,

  create_inquiry: records.create_inquiry,
  update_inquiry: records.update_inquiry,
  assign_inquiry: records.assign_inquiry,
  change_inquiry_status: records.change_inquiry_status,

  convert_document: records.convert_document,
  change_document_status: records.change_document_status,

  create_task: records.create_task,
  update_task: records.update_task,
  assign_task: records.assign_task,
  task_comment: records.task_comment,

  create_reminder: records.create_reminder,
  log_note: records.log_note,

  http_request: http.http_request,
  webhook_response: http.webhook_response,
};

export const NODE_TYPES = Object.keys(NODE_HANDLERS);
