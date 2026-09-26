// DB side of approval stages (plan item I) — the pure rules are in
// formBuilderApproval.js.
//
//   POST /form-builder/submissions/stage-action
//        { form_id, id, action: "approve" | "send_back", comment? }
//
// Who acts at a stage: the company owner (at every stage); at stage 1 the
// person who created the entry; at a later stage the users and teams the
// builder chose (a team = a department, same as the form Permissions tab).
// People who act at a stage can open the entries waiting for them even when
// they have no general access to the form's entries (see actorEntryScope).
import { QueryTypes } from "sequelize";
import { isCompanyOwner } from "../../middlewares/reportPinAuth.js";
import loginModel from "../../models/application_login/loginModel.js";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { formBuilderStageLogModel } from "../../models/form_builder/formBuilderStageLogModel.js";
import { formBuilderSubmissionFileModel } from "../../models/form_builder/formBuilderSubmissionFileModel.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";
import { logAuditEvent } from "../company_setup/auditLogServices.js";
import { mainTableName } from "./formBuilderDdlBuilder.js";
import { loginTeamId } from "./formBuilderPermissions.js";
import { approvalOf, nextState, stageIncompleteProblems, stageIndexOf } from "./formBuilderApproval.js";

const MODULE_KEY = "form_builder";
const ENTITY_TYPE_SUBMISSION = "form_builder_submission";
const COMMENT_MAX = 1000;

function parseSchema(json) {
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Who the current user is, in approval terms, for one form.
//   { approval, owner, loginId, myStageIds }   myStageIds: stages after the first that this user works on
export async function loadActorContext({ form, loginId, company_masters_id }) {
  const approval = approvalOf(form.published_settings_json);
  if (!approval.enabled || !loginId) return { approval, owner: false, loginId, myStageIds: [] };
  const owner = await isCompanyOwner(loginId, company_masters_id);
  const teamId = owner ? null : await loginTeamId(loginId);
  const myStageIds = approval.stages
    .filter((s, i) => i > 0 && (owner || s.users.includes(Number(loginId)) || (teamId != null && s.teams.includes(teamId))))
    .map((s) => s.id);
  return { approval, owner, loginId, myStageIds };
}

// Is this user the one to act on this entry right now?
export function isActorForRow(ctx, row) {
  if (!ctx.approval.enabled || !row?.current_stage || row.stage_status === "completed") return false;
  if (ctx.owner) return true;
  const index = stageIndexOf(ctx.approval.stages, row.current_stage);
  if (index < 0) return false;
  if (index === 0) return String(row.submitted_by_a_application_login_id) === String(ctx.loginId);
  return ctx.myStageIds.includes(row.current_stage);
}

// SQL condition for "waiting for me" (list filter and counts). Returns
// { sql, replacements } or null when the user can never act on this form.
export function pendingForMeCondition(ctx) {
  if (!ctx.approval.enabled) return null;
  if (ctx.owner) return { sql: "(current_stage IS NOT NULL AND stage_status <> 'completed')", replacements: {} };
  const parts = [];
  const replacements = { pendingMe: ctx.loginId };
  if (ctx.myStageIds.length > 0) {
    parts.push("(current_stage IN (:pendingStages) AND stage_status <> 'completed')");
    replacements.pendingStages = ctx.myStageIds;
  }
  // Sent back to stage 1: back to the person who created the entry.
  parts.push("(current_stage = :firstStage AND stage_status = 'sent_back' AND submitted_by_a_application_login_id = :pendingMe)");
  replacements.firstStage = ctx.approval.stages[0].id;
  return { sql: `(${parts.join(" OR ")})`, replacements };
}

// For a user with no general access to the form's entries: the entries they
// may still open — those waiting for them, and ones they handled before.
export function actorEntryScope(ctx, form_id) {
  const pending = pendingForMeCondition(ctx);
  if (!pending) return null;
  return {
    sql: `(${pending.sql} OR id IN (SELECT submission_id FROM form_builder_stage_log WHERE form_id = :scopeFormId AND a_application_login_id = :pendingMe AND isDelete = 0))`,
    replacements: { ...pending.replacements, pendingMe: ctx.loginId, scopeFormId: form_id },
  };
}

// Did this user act on the entry before (so they may still open it afterwards)?
export async function hasHandledEntry({ tenantDB, form_id, submission_id, loginId }) {
  if (!loginId) return false;
  const row = await formBuilderStageLogModel(tenantDB).findOne({
    where: { form_id, submission_id, a_application_login_id: loginId, isDelete: 0 },
    attributes: ["id"],
    raw: true,
  });
  return !!row;
}

export async function countPendingForMe({ tenantDB, form, ctx }) {
  const cond = pendingForMeCondition(ctx);
  if (!cond) return 0;
  const [row] = await tenantDB.query(`SELECT COUNT(*) AS n FROM \`${mainTableName(form.id)}\` WHERE isDelete = 0 AND ${cond.sql}`, {
    replacements: cond.replacements,
    type: QueryTypes.SELECT,
  });
  return Number(row?.n || 0);
}

export async function logStageEvent({ tenantDB, transaction, company_masters_id, form_id, submission_id, stage, action, comment = null, loginId = null }) {
  await formBuilderStageLogModel(tenantDB).create(
    {
      company_masters_id,
      form_id,
      submission_id,
      stage_id: stage.id,
      stage_name: stage.name,
      action,
      comment: comment ? String(comment).slice(0, COMMENT_MAX) : null,
      a_application_login_id: loginId || null,
      created_date_time: new Date(),
    },
    transaction ? { transaction } : undefined,
  );
}

// The history of one entry, oldest first, with the people's names.
export async function listStageLog({ tenantDB, form_id, submission_id }) {
  const rows = await formBuilderStageLogModel(tenantDB).findAll({
    where: { form_id, submission_id, isDelete: 0 },
    order: [["created_date_time", "ASC"], ["id", "ASC"]],
    raw: true,
  });
  const ids = [...new Set(rows.map((r) => r.a_application_login_id).filter(Boolean))];
  const logins = ids.length ? await loginModel.findAll({ where: { id: ids }, attributes: ["id", "username"], raw: true }) : [];
  const names = Object.fromEntries(logins.map((l) => [l.id, l.username]));
  return rows.map((r) => ({
    id: r.id,
    stage_id: r.stage_id,
    stage_name: r.stage_name,
    action: r.action,
    comment: r.comment,
    by: r.a_application_login_id ? names[r.a_application_login_id] || "(removed user)" : "Public form",
    created_date_time: r.created_date_time,
  }));
}

// Fixed columns added to Form Builder's fixed set after a form's table was
// first created (new tables get them straight from the DDL builder). Kept
// under this name for the approval columns that started it, but now covers
// every later addition — is_draft (M7), consent_at/consent_ip (M2),
// source/campaign (M6) — so a form published before those existed still
// gets them the next time it is republished. Idempotent.
export async function ensureStageColumns(tenantDB, table) {
  const [existing] = await tenantDB.query(`SHOW COLUMNS FROM \`${table}\``);
  const have = new Set(existing.map((c) => c.Field));
  const add = (name, def) => {
    if (!have.has(name)) return `ADD COLUMN \`${name}\` ${def}`;
    return null;
  };
  const parts = [
    add("current_stage", "VARCHAR(20) NULL DEFAULT NULL"),
    add("stage_status", "VARCHAR(20) NULL DEFAULT NULL"),
    add("is_draft", "TINYINT NOT NULL DEFAULT 0"),
    add("consent_at", "DATETIME NULL DEFAULT NULL"),
    add("consent_ip", "VARCHAR(64) NULL DEFAULT NULL"),
    add("source", "VARCHAR(100) NULL DEFAULT NULL"),
    add("campaign", "VARCHAR(100) NULL DEFAULT NULL"),
  ].filter(Boolean);
  if (parts.length > 0) await tenantDB.query(`ALTER TABLE \`${table}\` ${parts.join(", ")}`);

  const [stageIndex] = await tenantDB.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = 'idx_stage'`);
  if (stageIndex.length === 0) await tenantDB.query(`ALTER TABLE \`${table}\` ADD INDEX \`idx_stage\` (\`current_stage\`, \`stage_status\`)`);
  const [draftIndex] = await tenantDB.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = 'idx_draft'`);
  if (draftIndex.length === 0) await tenantDB.query(`ALTER TABLE \`${table}\` ADD INDEX \`idx_draft\` (\`is_draft\`)`);
}

// Approve or send back the entry at its current stage.
export const stageAction = async (req) => {
  try {
    const a_application_login_id = req.body?.a_application_login_id;
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company) return resError({ ack_msg: "Company not found for login ID" });
    const company_masters_id = company.company_masters_id;

    const { form_id, id, action, comment } = req.body || {};
    if (action !== "approve" && action !== "send_back") return resError({ ack_msg: "Choose Approve or Send back." });
    const cleanComment = String(comment ?? "").trim();
    if (action === "send_back" && !cleanComment) return resError({ ack_msg: "Write a short comment so the person knows what to fix." });
    if (cleanComment.length > COMMENT_MAX) return resError({ ack_msg: `The comment can be at most ${COMMENT_MAX} characters.` });

    const form = await formBuilderFormModel(req.tenantDB).findOne({ where: { id: form_id, company_masters_id, isDelete: 0 } });
    if (!form || !form.published_schema_json) return resError({ ack_msg: "Form not found or not published" });
    const ctx = await loadActorContext({ form, loginId: a_application_login_id, company_masters_id });
    if (!ctx.approval.enabled) return resError({ ack_msg: "This form has no approval stages." });

    const table = mainTableName(form.id);
    const fields = parseSchema(form.published_schema_json);
    let message = "";
    let resultState = null;

    const outcome = await req.tenantDB.transaction(async (transaction) => {
      // Locked so two people can't act on the same entry at once.
      const [row] = await req.tenantDB.query(`SELECT * FROM \`${table}\` WHERE id = :id AND isDelete = 0 LIMIT 1 FOR UPDATE`, {
        replacements: { id },
        type: QueryTypes.SELECT,
        transaction,
      });
      if (!row) return { error: "Entry not found" };
      if (!row.current_stage || row.stage_status === "completed") return { error: "This entry isn't waiting for anyone." };

      const stage = ctx.approval.stages.find((s) => s.id === row.current_stage);
      if (!stage) return { error: "This entry is at a stage that no longer exists." };
      if (!isActorForRow(ctx, row)) return { error: `It isn't your turn — this entry is waiting for ${stage.name}.`, code: 403 };

      if (action === "approve") {
        const files = await formBuilderSubmissionFileModel(req.tenantDB).findAll({
          where: { form_id: form.id, submission_id: id, isDelete: 0 },
          attributes: ["field_key"],
          raw: true,
          transaction,
        });
        const problems = stageIncompleteProblems({ fields, approval: ctx.approval, stageId: stage.id, row, fileKeys: new Set(files.map((f) => f.field_key)) });
        if (problems.length > 0) return { error: `Before approving: ${problems.join("; ")}.` };
      }

      const next = nextState(ctx.approval.stages, stage.id, action);
      if (next.error) return { error: next.error };
      await req.tenantDB.query(`UPDATE \`${table}\` SET current_stage = :current_stage, stage_status = :stage_status WHERE id = :id`, {
        replacements: { ...next.state, id },
        type: QueryTypes.UPDATE,
        transaction,
      });
      await logStageEvent({
        tenantDB: req.tenantDB,
        transaction,
        company_masters_id,
        form_id: form.id,
        submission_id: id,
        stage,
        action,
        comment: cleanComment || null,
        loginId: a_application_login_id,
      });
      return { stage, state: next.state };
    });

    if (outcome.error) return resError({ code: outcome.code || 200, ack_msg: outcome.error });

    resultState = outcome.state;
    const target = ctx.approval.stages.find((s) => s.id === resultState.current_stage);
    if (resultState.stage_status === "completed") message = "Approved — the entry is complete.";
    else if (action === "approve") message = `Approved — now waiting for ${target.name}.`;
    else message = `Sent back to ${target.name}.`;

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: action === "approve" ? "stage_approve" : "stage_send_back",
      entity_type: ENTITY_TYPE_SUBMISSION,
      entity_id: id,
      details: { stage: outcome.stage.name, to: resultState, ...(cleanComment ? { comment: cleanComment } : {}) },
    });

    return resSuccess({ ack_msg: message, data: { state: resultState } });
  } catch (e) {
    console.error("stageAction error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
