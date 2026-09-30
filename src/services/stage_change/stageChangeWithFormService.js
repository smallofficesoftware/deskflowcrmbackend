import moment from "moment";
import loginModel from "../../models/application_login/loginModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId, insertStagesAndStatusLogs } from "../commonServices.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";
import { buildContactWhereClause } from "../activities/contactService.js";
import { automationBefore, emitAutomationEvent } from "../automation/emit.js";

/**
 * Single place that moves a Contact / Inquiry to a stage for the web and
 * Flutter apps. Does what commonUpdate (single) and assignStatusContact (bulk)
 * do for a stage change - team gate, status update, status log, automation
 * events, push notification - and additionally saves the "stage form" custom
 * field values (custom_field_form_masters.display_on = 2 whose stage_ids
 * contain the target stage) together with an old -> new snapshot on the status
 * log row (status_and_stages_logs.stage_form_data), all in one transaction.
 *
 * Body: { module: "contact" | "inquiry", stage_id, appliedTo: id | [ids] | "all",
 *         appliedFilers (contact, appliedTo = "all"), position (contact Kanban),
 *         stage_form_values: [{ field_id, value }] }
 */

const MODULES = {
  contact: { table: "contact_masters", formType: 1, orderType: 1 },
  inquiry: { table: "inquiries", formType: 2, orderType: 2 },
};

// custom_field_form_masters.data_type
const DT_DATE = 4;
const DT_DATE_TIME = 5;
const DT_SWITCH = 7;

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

const toIdList = (appliedTo) => {
  const raw = Array.isArray(appliedTo) ? appliedTo : String(appliedTo).split(",");
  return raw.map((v) => Number(String(v).trim())).filter((v) => Number.isInteger(v) && v > 0);
};

// Value as it is stored in the record's custom column.
const normalizeForSave = (dataType, value) => {
  if (dataType === DT_SWITCH) {
    return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true" ? 1 : 0;
  }
  if (isBlank(value)) return null;
  if (dataType === DT_DATE) return moment(value).format("YYYY-MM-DD");
  if (dataType === DT_DATE_TIME) return moment(value).format("YYYY-MM-DD HH:mm:ss");
  return typeof value === "string" ? value.trim() : value;
};

// Value as it is shown in the timeline snapshot.
const normalizeForSnapshot = (dataType, value) => {
  if (value === undefined || value === null || value === "") return null;
  if (dataType === DT_DATE) return moment(value).format("YYYY-MM-DD");
  if (dataType === DT_DATE_TIME) return moment(value).format("YYYY-MM-DD HH:mm:ss");
  if (dataType === DT_SWITCH) return Number(value) === 1 || value === true ? 1 : 0;
  return value;
};

const notifyContactStageChange = async ({ req, contactIds, stageName, requesterLoginId }) => {
  try {
    const contactData = await contactModel(req.tenantDB).findAll({
      where: { id: contactIds },
      attributes: ["a_application_login_id", "person_name"],
    });
    if (!contactData.length) return;

    const loginIds = contactData.map((c) => c.a_application_login_id).filter((id) => id);
    if (!loginIds.length) return;

    const assignedTokenData = await loginModel.findAll({
      where: { id: loginIds, isDelete: 0 },
      attributes: ["web_refresh_token", "android_refresh_token", "ios_refresh_token", "reporting_member"],
    });
    if (!assignedTokenData.length) return;

    const allTokens = [];
    const reportingMemberIds = new Set();
    for (const t of assignedTokenData) {
      allTokens.push(t.web_refresh_token, t.android_refresh_token, t.ios_refresh_token);
      if (t.reporting_member) reportingMemberIds.add(t.reporting_member);
    }
    if (reportingMemberIds.size > 0) {
      const reportingMemberData = await loginModel.findAll({
        where: { id: Array.from(reportingMemberIds), isDelete: 0 },
        attributes: ["web_refresh_token", "android_refresh_token", "ios_refresh_token"],
      });
      for (const m of reportingMemberData) {
        allTokens.push(m.web_refresh_token, m.android_refresh_token, m.ios_refresh_token);
      }
    }

    const uniqueTokens = [...new Set(allTokens.filter((t) => t && t.trim() !== ""))];
    if (!uniqueTokens.length) return;

    const contactNames = contactData.map((c) => c.person_name).filter(Boolean).join(", ");
    const changingUser = await loginModel.findOne({
      where: { id: requesterLoginId, isDelete: 0 },
      attributes: ["username"],
    });
    await sendMultipleNotification({
      deviceTokens: uniqueTokens,
      title: `${contactNames || "Contact"} Status Changed to ${stageName} by ${changingUser?.username || "Someone"}`,
    });
  } catch (error) {
    console.log("Error processing notifications:", error.message);
  }
};

export const changeStageWithForm = async (req) => {
  let transaction;
  try {
    const { module, stage_id, appliedTo, appliedFilers, position, stage_form_values } = req.body;
    const cfg = MODULES[module];
    if (!cfg) {
      return resBadRequest({ ack_msg: "Invalid module.", developer_msg: "module must be contact or inquiry" });
    }
    if (!isValid(stage_id) || !isValid(appliedTo)) {
      return resError({ ack_msg: "Selected Status Not Found." });
    }

    const requesterLoginId = req.headers["x-tenant-id"] || req.body.a_application_login_id;
    const requesterCompany = await getCompanyByLoginId(requesterLoginId);
    if (!requesterCompany) {
      return resBadRequest({ ack_msg: "Company not found.", developer_msg: "company not found for login" });
    }

    const stage = await stagestatusModel(req.tenantDB).findOne({
      where: { id: stage_id, isDelete: 0, order_type: cfg.orderType },
      attributes: ["id", "name", "change_status_team_ids"],
      raw: true,
    });
    if (!stage) {
      return resError({ ack_msg: "Selected Status Not Found.", developer_msg: "stage not found for this module" });
    }

    // change_status_team_ids gate (same rule as commonUpdate: empty = everyone, company owner exempt)
    if (requesterCompany.company_flag !== 1 && isValid(stage.change_status_team_ids)) {
      const allowedIds = String(stage.change_status_team_ids).split(",").map((i) => i.trim());
      if (!allowedIds.includes(String(requesterLoginId))) {
        return resError({
          ack_msg: "You do not have permission to change status to this stage.",
          developer_msg: "requesterLoginId not in stage_status_masters.change_status_team_ids for target stage",
        });
      }
    }

    const Model = cfg.formType === 1 ? contactModel(req.tenantDB) : inquiryModel(req.tenantDB);

    // Stage form fields asked on this stage
    const allStageFields = await customFieldFormModel(req.tenantDB).findAll({
      where: {
        company_masters_id: requesterCompany.company_masters_id,
        form_type: cfg.formType,
        display_on: 2,
        isDelete: 0,
      },
      attributes: ["id", "title", "data_type", "reference_column_name", "required_or_not", "stage_ids"],
      order: [["display_order", "ASC"]],
      raw: true,
    });
    const stageFields = allStageFields.filter(
      (f) =>
        Model.rawAttributes[f.reference_column_name] &&
        String(f.stage_ids || "").split(",").map((s) => s.trim()).includes(String(stage.id)),
    );

    const valueByField = new Map();
    if (Array.isArray(stage_form_values)) {
      for (const v of stage_form_values) valueByField.set(Number(v.field_id), v.value);
    }

    const missing = stageFields.filter(
      (f) => Number(f.required_or_not) === 1 && f.data_type !== DT_SWITCH && isBlank(valueByField.get(f.id)),
    );
    if (missing.length) {
      return resError({
        ack_msg: `Please fill required field(s): ${missing.map((f) => f.title).join(", ")}`,
        developer_msg: "stage form required fields missing",
        data: { missing_field_ids: missing.map((f) => f.id) },
      });
    }

    // Target records
    let whereClause;
    if (appliedTo === "all") {
      if (cfg.formType !== 1) {
        return resBadRequest({ ack_msg: "Something went wrong", developer_msg: "appliedTo all is contact only" });
      }
      const filters = { ...(appliedFilers || {}), a_application_login_id: req.body.a_application_login_id };
      ({ whereClause } = await buildContactWhereClause({ req, params: filters }));
    } else {
      const ids = toIdList(appliedTo);
      if (!ids.length) {
        return resBadRequest({ ack_msg: "Something went wrong", developer_msg: "invalid appliedTo" });
      }
      whereClause = { id: ids, isDelete: 0 };
    }

    const fieldColumns = stageFields.map((f) => f.reference_column_name);
    const records = await Model.findAll({
      where: whereClause,
      attributes: ["id", ...fieldColumns],
      raw: true,
    });
    if (!records.length) {
      return resError({ ack_msg: "No records found.", developer_msg: "no records matched" });
    }
    const recordIds = records.map((r) => r.id);

    const automationWhere = recordIds.length === 1 ? { id: recordIds[0] } : { id: recordIds };
    const automationBeforeRows = await automationBefore(req, cfg.table, automationWhere);

    // New values for the record columns (same values for every selected record)
    const newColumnValues = {};
    for (const f of stageFields) {
      newColumnValues[f.reference_column_name] = normalizeForSave(f.data_type, valueByField.get(f.id));
    }
    const updateData = { contact_status: stage.id, ...newColumnValues };
    if (cfg.formType === 1 && recordIds.length === 1 && isValid(position)) {
      updateData.position = position;
    }

    transaction = await req.tenantDB.transaction();
    const [affectedRows] = await Model.update(updateData, { where: { id: recordIds }, transaction });

    for (const record of records) {
      const snapshot = stageFields.map((f) => ({
        field_id: f.id,
        title: f.title,
        data_type: f.data_type,
        reference_column_name: f.reference_column_name,
        old_value: normalizeForSnapshot(f.data_type, record[f.reference_column_name]),
        new_value: normalizeForSnapshot(f.data_type, newColumnValues[f.reference_column_name]),
      }));
      const log = await insertStagesAndStatusLogs(req, {
        reference_table: cfg.table,
        reference_id: record.id,
        status_id: stage.id,
        a_application_login_id: requesterLoginId,
        stage_form_data: snapshot.length ? JSON.stringify(snapshot) : null,
        transaction,
      });
      // insertStagesAndStatusLogs swallows its own errors and returns {} - roll back instead of a silent gap in the timeline
      if (!log || !log.id) {
        throw new Error(`status log not saved for ${cfg.table} ${record.id}`);
      }
    }

    await transaction.commit();
    transaction = null;

    emitAutomationEvent(req, "record.updated", {
      table: cfg.table,
      where: automationWhere,
      before: automationBeforeRows,
      data: updateData,
    });
    if (cfg.formType === 1) {
      await notifyContactStageChange({ req, contactIds: recordIds, stageName: stage.name, requesterLoginId });
    }

    return resSuccess({
      data: { affectedRows },
      ack_msg: "Status assigned successfully.",
    });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (e) { /* already finished */ }
    }
    console.error("changeStageWithForm Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
};
