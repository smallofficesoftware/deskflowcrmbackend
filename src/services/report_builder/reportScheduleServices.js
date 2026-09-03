// Step 8a — scheduled delivery of a report_definition. CRUD here is
// build-tier (owner+PIN, same as everything else that configures a
// report). Dispatching is the one piece that runs OUTSIDE any user
// request — see reportScheduleDispatchCroneTabRunner at the bottom,
// which mirrors the EXISTING external-cron pattern this codebase already
// uses for every other recurring job (cronJobServices.js's
// *CroneTabRunner functions: an external cron tab — not an in-process
// node-cron interval — hits an HTTP endpoint periodically; nothing in
// this file starts a live timer). That endpoint is inert until BOTH (a)
// EXTERNAL_CRONE_RUNNING_FLAG is set and (b) a cron_jobs row exists with
// crone_tab_start_stop_flag:1 for cron_title
// 'crone_tab_report_schedule_dispatch' — a DBA/admin action outside this
// codebase, same standing manual follow-up every schema change this
// session already has.
import fs from "fs";
import path from "path";
import moment from "moment";
import { Op } from "sequelize";
import nodemailer from "nodemailer";
import cronJobsModel from "../../models/configuration/cronJobsModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import { reportDefinitionModel } from "../../models/report_builder/reportDefinitionModel.js";
import { reportRunModel } from "../../models/report_builder/reportRunModel.js";
import { reportScheduleModel } from "../../models/report_builder/reportScheduleModel.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import {
  EXTERNAL_CRONE_RUNNING_FLAG_VAR,
  MAIL_SETTING_HOST_NAME,
  MAIL_SETTING_HOST_PORT,
  MAIL_SETTING_HOST_USER_NAME,
  MAIL_SETTING_HOST_USER_PASSWORD,
} from "../../utils/appConstants.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";
import { exportReportExcel, exportReportPdf } from "./reportPdfExport.js";

const now = () => moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
const asJsonString = (value) => (typeof value === "string" ? value : JSON.stringify(value));

// ---- next_run_at computation — plain local time, no timezone stored,
// same convention every other plain date/time field in this schema
// already follows. day_of_month is capped 1-28 at creation (see
// createReportSchedule) specifically so it's valid in every month. ----
const computeNextRunAt = ({ frequency, send_time, day_of_week, day_of_month }, from = moment()) => {
  const [hh, mm] = String(send_time).split(":").map(Number);
  if (frequency === "daily") {
    let next = from.clone().hour(hh).minute(mm).second(0);
    if (!next.isAfter(from)) next.add(1, "day");
    return next;
  }
  if (frequency === "weekly") {
    let next = from.clone().day(day_of_week).hour(hh).minute(mm).second(0);
    if (!next.isAfter(from)) next.add(1, "week");
    return next;
  }
  // monthly
  let next = from.clone().date(day_of_month).hour(hh).minute(mm).second(0);
  if (!next.isAfter(from)) next.add(1, "month").date(day_of_month);
  return next;
};

// ---- CRUD — owner+PIN build-tier, same IDOR-guard pattern every other
// mutation in reportDefinitionServices.js already uses. ----
export const listReportSchedules = async (req) => {
  try {
    const { id } = req.params || {};
    const { a_application_login_id } = req.body || {};
    if (!id || !a_application_login_id) {
      return resError({ developer_msg: "id (param, report_definition_id) and a_application_login_id are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const ReportSchedule = reportScheduleModel(req.tenantDB);
    const rows = await ReportSchedule.findAll({
      where: { report_definition_id: id, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
      order: [["id", "DESC"]],
    });
    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("listReportSchedules error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const createReportSchedule = async (req) => {
  try {
    const { id } = req.params || {};
    const { a_application_login_id, frequency, send_time, day_of_week, day_of_month, delivery_format, recipients } = req.body || {};
    if (!id || !a_application_login_id || !frequency || !send_time) {
      return resError({ developer_msg: "id (param), a_application_login_id, frequency and send_time are required" });
    }
    if (!["daily", "weekly", "monthly"].includes(frequency)) {
      return resError({ developer_msg: `Invalid frequency "${frequency}"` });
    }
    if (frequency === "weekly" && (day_of_week === undefined || day_of_week === null)) {
      return resError({ developer_msg: "day_of_week is required for a weekly schedule" });
    }
    if (frequency === "monthly" && (day_of_month === undefined || day_of_month === null)) {
      return resError({ developer_msg: "day_of_month is required for a monthly schedule" });
    }
    const cappedDayOfMonth = frequency === "monthly" ? Math.min(Math.max(Number(day_of_month), 1), 28) : null;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const ReportDefinition = reportDefinitionModel(req.tenantDB);
    const definition = await ReportDefinition.findOne({
      where: { id, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
    });
    if (!definition) {
      return resError({ code: 404, ack_msg: "Report not found", developer_msg: "No matching report definition for this company" });
    }

    const spec = { frequency, send_time, day_of_week: day_of_week ?? null, day_of_month: cappedDayOfMonth };
    const ReportSchedule = reportScheduleModel(req.tenantDB);
    const created = await ReportSchedule.create({
      company_masters_id: findCompanyId.company_masters_id,
      report_definition_id: definition.id,
      a_application_login_id,
      frequency,
      send_time,
      day_of_week: spec.day_of_week,
      day_of_month: spec.day_of_month,
      delivery_format: delivery_format || "excel",
      recipients: asJsonString(recipients || { logins: [], emails: [] }),
      next_run_at: computeNextRunAt(spec).format("YYYY-MM-DD HH:mm:ss"),
      created_date_time: now(),
    });
    return resSuccess({ data: { item: created }, ack_msg: "Schedule created successfully" });
  } catch (e) {
    console.error("createReportSchedule error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const updateReportSchedule = async (req) => {
  try {
    const { scheduleId } = req.params || {};
    const { a_application_login_id, frequency, send_time, day_of_week, day_of_month, delivery_format, recipients, isActive } = req.body || {};
    if (!scheduleId || !a_application_login_id) {
      return resError({ developer_msg: "scheduleId (param) and a_application_login_id are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const ReportSchedule = reportScheduleModel(req.tenantDB);
    const schedule = await ReportSchedule.findOne({
      where: { id: scheduleId, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
    });
    if (!schedule) {
      return resError({ code: 404, ack_msg: "Schedule not found", developer_msg: "No matching schedule for this company" });
    }

    const patch = {};
    if (frequency !== undefined) patch.frequency = frequency;
    if (send_time !== undefined) patch.send_time = send_time;
    if (day_of_week !== undefined) patch.day_of_week = day_of_week;
    if (day_of_month !== undefined) patch.day_of_month = Math.min(Math.max(Number(day_of_month), 1), 28);
    if (delivery_format !== undefined) patch.delivery_format = delivery_format;
    if (recipients !== undefined) patch.recipients = asJsonString(recipients);
    if (isActive !== undefined) patch.isActive = isActive ? 1 : 0;

    // Any timing field change recomputes next_run_at off the (possibly
    // patched) spec — a scheduling change should take effect on the next
    // occurrence, not silently keep the old one.
    if (frequency !== undefined || send_time !== undefined || day_of_week !== undefined || day_of_month !== undefined) {
      const spec = {
        frequency: patch.frequency ?? schedule.frequency,
        send_time: patch.send_time ?? schedule.send_time,
        day_of_week: patch.day_of_week ?? schedule.day_of_week,
        day_of_month: patch.day_of_month ?? schedule.day_of_month,
      };
      patch.next_run_at = computeNextRunAt(spec).format("YYYY-MM-DD HH:mm:ss");
    }

    await schedule.update(patch);
    return resSuccess({ data: { item: schedule }, ack_msg: "Schedule updated successfully" });
  } catch (e) {
    console.error("updateReportSchedule error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteReportSchedule = async (req) => {
  try {
    const { scheduleId } = req.params || {};
    const { a_application_login_id } = req.body || {};
    if (!scheduleId || !a_application_login_id) {
      return resError({ developer_msg: "scheduleId (param) and a_application_login_id are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" });
    }
    const ReportSchedule = reportScheduleModel(req.tenantDB);
    const schedule = await ReportSchedule.findOne({
      where: { id: scheduleId, company_masters_id: findCompanyId.company_masters_id, isDelete: 0 },
    });
    if (!schedule) {
      return resError({ code: 404, ack_msg: "Schedule not found", developer_msg: "No matching schedule for this company" });
    }
    await schedule.update({ isDelete: 1 });
    return resSuccess({ ack_msg: "Schedule deleted successfully" });
  } catch (e) {
    console.error("deleteReportSchedule error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// ---- Delivery helpers ----

// Reads back the file exportReportExcel/exportReportPdf already wrote to
// disk (both save under media-folder/exports/report_pdf/{company_masters_id}/
// {fileName} — confirmed directly in reportPdfExport.js; neither
// function returns the on-disk path itself, only a public fileUrl, so
// this reconstructs it from the same known convention rather than
// duplicating either function's file-writing logic).
const readGeneratedFile = (company_masters_id, fileName) => {
  const filePath = path.resolve(process.cwd(), `media-folder/exports/report_pdf/${company_masters_id}`, fileName);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
};

const sendScheduleEmail = async ({ toEmails, subject, reportName, attachments }) => {
  if (toEmails.length === 0 || attachments.length === 0) return;
  const transporter = nodemailer.createTransport({
    host: MAIL_SETTING_HOST_NAME,
    port: MAIL_SETTING_HOST_PORT,
    secure: true,
    auth: { user: MAIL_SETTING_HOST_USER_NAME, pass: MAIL_SETTING_HOST_USER_PASSWORD },
  });
  await transporter.verify();
  await transporter.sendMail({
    from: MAIL_SETTING_HOST_USER_NAME,
    to: toEmails.join(","),
    subject,
    text: `Your scheduled report "${reportName}" is attached.`,
    attachments,
  });
};

// Resolves recipients.logins (internal team members) into device tokens
// (push) + recovery_email (email), merged with recipients.emails (raw
// external addresses, push-ineligible by definition). No access check
// against report_definition_team_rights here — deliberate, per the
// plan's decision: the owner scheduling a report is trusted to decide
// who receives it, same as they could just forward the file manually.
const resolveRecipients = async (recipients) => {
  const loginIds = Array.isArray(recipients?.logins) ? recipients.logins : [];
  const externalEmails = Array.isArray(recipients?.emails) ? recipients.emails.filter(Boolean) : [];

  let deviceTokens = [];
  let internalEmails = [];
  if (loginIds.length > 0) {
    const logins = await loginModel.findAll({
      where: { id: { [Op.in]: loginIds }, isDelete: 0 },
      attributes: ["id", "web_refresh_token", "android_refresh_token", "ios_refresh_token", "recovery_email"],
    });
    deviceTokens = logins.flatMap((l) => [l.web_refresh_token, l.android_refresh_token, l.ios_refresh_token]).filter((t) => t && t.trim() !== "");
    internalEmails = logins.map((l) => l.recovery_email).filter((e) => e && e.trim() !== "");
  }
  return {
    deviceTokens: [...new Set(deviceTokens)],
    emails: [...new Set([...internalEmails, ...externalEmails])],
  };
};

// One schedule's full cycle: run -> generate file(s) -> deliver ->
// bookkeeping (last_run_at/next_run_at, a report_runs row with
// trigger_type:'scheduled'). Delivery errors are caught per-schedule so
// one bad schedule's mail-server hiccup doesn't stop the dispatcher from
// reaching the rest of this tenant's schedules.
const dispatchOneSchedule = async (schedule, req) => {
  const startedAt = Date.now();
  const ReportDefinition = reportDefinitionModel(req.tenantDB);
  const definition = await ReportDefinition.findOne({
    where: { id: schedule.report_definition_id, company_masters_id: schedule.company_masters_id, isDelete: 0 },
  });
  if (!definition) return; // report deleted since scheduling — nothing to run, leave the schedule as-is for a human to notice/clean up

  const recipients = JSON.parse(schedule.recipients || "{}");
  const { deviceTokens, emails } = await resolveRecipients(recipients);

  const exportReq = { ...req, params: { id: definition.id }, body: { a_application_login_id: schedule.a_application_login_id } };
  const attachments = [];
  let runSucceeded = true;
  let errorMessage = null;

  // `{}` stands in for `res` — confirmed neither exportReportExcel/
  // exportReportPdf nor the one registered plugin (productInventoryReport,
  // via runDefinitionByType's plugin branch) ever call a method on it,
  // only pass it through unused. Would need a real Express-like res if a
  // future plugin ever started calling res.status()/res.json() itself.
  try {
    if (schedule.delivery_format === "excel" || schedule.delivery_format === "both") {
      const result = await exportReportExcel(exportReq, {});
      if (result?.ack === 1) {
        const buffer = readGeneratedFile(schedule.company_masters_id, result.data.fileName);
        if (buffer) attachments.push({ filename: result.data.fileName, content: buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      } else {
        runSucceeded = false;
        errorMessage = result?.developer_msg || result?.ack_msg || "Excel export failed";
      }
    }
    if (schedule.delivery_format === "pdf" || schedule.delivery_format === "both") {
      const result = await exportReportPdf(exportReq, {});
      if (result?.ack === 1) {
        const buffer = readGeneratedFile(schedule.company_masters_id, result.data.fileName);
        if (buffer) attachments.push({ filename: result.data.fileName, content: buffer, contentType: "application/pdf" });
      } else {
        runSucceeded = false;
        errorMessage = errorMessage || result?.developer_msg || result?.ack_msg || "PDF export failed";
      }
    }

    if (attachments.length > 0) {
      await sendScheduleEmail({ toEmails: emails, subject: `Scheduled report: ${definition.name}`, reportName: definition.name, attachments });
      if (deviceTokens.length > 0) {
        await sendMultipleNotification({
          deviceTokens,
          title: "Scheduled report ready",
          body: definition.name,
          notification_modual: "report_schedule",
        });
      }
    }
  } catch (e) {
    runSucceeded = false;
    errorMessage = String(e).slice(0, 500);
    console.error(`dispatchOneSchedule error (schedule ${schedule.id}):`, e);
  }

  const ReportRun = reportRunModel(req.tenantDB);
  await ReportRun.create({
    company_masters_id: schedule.company_masters_id,
    report_definition_id: definition.id,
    executed_by: schedule.a_application_login_id,
    executed_at: now(),
    row_count: null,
    duration_ms: Date.now() - startedAt,
    success: runSucceeded ? 1 : 0,
    error_message: errorMessage,
    trigger_type: "scheduled",
  });

  const nextRun = computeNextRunAt({
    frequency: schedule.frequency,
    send_time: schedule.send_time,
    day_of_week: schedule.day_of_week,
    day_of_month: schedule.day_of_month,
  });
  await schedule.update({ last_run_at: now(), next_run_at: nextRun.format("YYYY-MM-DD HH:mm:ss") });
};

// ---- The external-cron entry point. Mirrors cronJobServices.js's own
// *CroneTabRunner shape exactly: paginated over tenant_masters (offset/
// limit as URL params, same as taskCreationCroneTabRunner), sequential
// per-tenant loop (never Promise.all — same "one bad tenant doesn't fail
// the batch" rule every other cron runner in this codebase already
// follows), tenantMiddleware sets up req.tenantDB per tenant exactly like
// every other runner here does. ----
export const reportScheduleDispatchCroneTabRunner = async (req, res) => {
  try {
    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != "1") {
      return resError({ ack_msg: "no permission to run crone", developer_msg: "EXTERNAL_CRONE_RUNNING_FLAG is not set to 1" });
    }
    const checkCroneStatus = await cronJobsModel.findOne({
      where: { crone_tab_start_stop_flag: 1, cron_title: "crone_tab_report_schedule_dispatch" },
    });
    if (!checkCroneStatus) {
      return resError({ ack_msg: "The database administrator has stopped this cron.", developer_msg: "No active cron_jobs row for crone_tab_report_schedule_dispatch" });
    }

    const offset = Number(req.params.offset) || 0;
    const limit = Number(req.params.limit) || 50;
    const tenants = await tenantMasterModel.findAll({
      where: { isDelete: 0 },
      attributes: ["a_application_login_id", "company_masters_id"],
      order: [["id", "ASC"]],
      limit,
      offset,
      raw: true,
    });

    const summary = [];
    for (const tenant of tenants) {
      req.headers["x-tenant-id"] = tenant.a_application_login_id;
      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch {
        continue;
      }

      const ReportSchedule = reportScheduleModel(req.tenantDB);
      const dueSchedules = await ReportSchedule.findAll({
        where: { company_masters_id: tenant.company_masters_id, isActive: 1, isDelete: 0, next_run_at: { [Op.lte]: now() } },
      });

      for (const schedule of dueSchedules) {
        await dispatchOneSchedule(schedule, req);
      }
      if (dueSchedules.length > 0) summary.push({ company_masters_id: tenant.company_masters_id, dispatched: dueSchedules.length });
    }

    return resSuccess({ ack_msg: "report schedule dispatch crone run successfully", data: summary });
  } catch (e) {
    console.error("reportScheduleDispatchCroneTabRunner error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
