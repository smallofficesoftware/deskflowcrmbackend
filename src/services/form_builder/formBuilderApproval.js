// Approval stages (plan item I): a form can pass through ordered stages, e.g.
//   1 Counsellor  ->  2 Division Head  ->  3 Quotation Issuer  ->  4 Checked By
// Pure module (no DB): settings shape, who-fills-what, the state machine and
// the publish checks. The DB side is formBuilderApprovalService.js.
//
// Form settings (settings_json / published_settings_json):
//   { approval: { enabled: true, stages: [
//       { id: "s1", name: "Counsellor" },                       // stage 1 = whoever fills the form
//       { id: "s2", name: "Division Head", users: [12], teams: [3], signature_field: "head_sign" },
//       ... ] } }
// Field prop:  stage: "s2"  — the stage that fills / edits this field (default: the first stage).
//
// Entry state (two columns on the form's own table):
//   current_stage  the stage id the entry is waiting at
//   stage_status   "pending"   waiting for that stage's people
//                  "sent_back" returned to that stage with a comment
//                  "completed" every stage approved — locked
// An entry saved before stages were switched on has no current_stage and is
// left exactly as it was (plan Q7).
//
// Flow: creating an entry IS stage 1; it then waits at stage 2. Approve moves
// on (the last stage completes it); Send back returns it to the stage above
// with a comment. Completed entries can only be changed by people with the
// form's "Edit completed entries" permission.

import { evaluateVisibility, isRequired } from "./formBuilderConditions.js";
import { LAYOUT_TYPES } from "./formBuilderDdlBuilder.js";

export const STAGE_STATUSES = ["pending", "sent_back", "completed"];
export const STAGE_ACTIONS = ["submit", "approve", "send_back", "edit_completed"];
export const MAX_STAGES = 8;
const STAGE_ID_PATTERN = /^s[0-9]{1,3}$/;
const FILE_TYPES = new Set(["file", "signature", "image"]);

// The approval part of the form settings, normalised. Never throws.
export function approvalOf(settings) {
  let parsed = settings;
  if (typeof settings === "string") {
    try {
      parsed = JSON.parse(settings);
    } catch {
      parsed = null;
    }
  }
  const raw = parsed && typeof parsed === "object" ? parsed.approval : null;
  const stages = Array.isArray(raw?.stages)
    ? raw.stages
        .filter((s) => s && typeof s === "object" && s.id != null)
        .map((s) => ({
          id: String(s.id),
          name: String(s.name ?? "").trim(),
          users: (Array.isArray(s.users) ? s.users : []).map(Number).filter((n) => Number.isInteger(n) && n > 0),
          teams: (Array.isArray(s.teams) ? s.teams : []).map(Number).filter((n) => Number.isInteger(n) && n > 0),
          signature_field: s.signature_field ? String(s.signature_field) : null,
        }))
    : [];
  return { enabled: !!raw?.enabled && stages.length >= 2, stages };
}

export const stageIndexOf = (stages, id) => stages.findIndex((s) => s.id === id);

// The stage a field belongs to: its own `stage` when that stage exists,
// otherwise the first stage.
export function fieldStageId(field, stages) {
  if (field?.stage && stages.some((s) => s.id === String(field.stage))) return String(field.stage);
  return stages[0]?.id ?? null;
}

const isDataField = (f) => f && f.key && !LAYOUT_TYPES.has(f.type);

// Keys a stage may fill or edit.
export function editableKeysAt(fields, stages, stageId) {
  return new Set(fields.filter((f) => isDataField(f) && fieldStageId(f, stages) === stageId).map((f) => f.key));
}

// What happens when an entry is created: it is stage 1's work, so it moves on.
export function initialStageState(stages) {
  if (stages.length < 2) return null;
  return { current_stage: stages[1].id, stage_status: "pending" };
}

// The state after an action at `stageId`. Returns { state } or { error }.
export function nextState(stages, stageId, action) {
  const i = stageIndexOf(stages, stageId);
  if (i < 0) return { error: "This entry is at a stage that no longer exists." };
  if (action === "approve") {
    if (i === stages.length - 1) return { state: { current_stage: stageId, stage_status: "completed" } };
    return { state: { current_stage: stages[i + 1].id, stage_status: "pending" } };
  }
  if (action === "send_back") {
    if (i === 0) return { error: "The first stage has nobody above it to send back to." };
    return { state: { current_stage: stages[i - 1].id, stage_status: "sent_back" } };
  }
  return { error: "Unknown action." };
}

// What this user may change on an entry right now.
//   mode "open"    no approval in play (or completed and the user may edit) — normal rules
//   mode "stage"   the user acts at the current stage: only that stage's fields
//   mode "locked"  nothing can be changed (waiting for others / completed)
// `lockedKeys`: fields that may not be written; `message`: why (for "locked").
export function approvalWriteState({ approval, fields, row, isActor, canEditCompleted }) {
  if (!approval?.enabled || !row || !row.current_stage) return { mode: "open", lockedKeys: new Set(), message: null };
  const stage = approval.stages.find((s) => s.id === row.current_stage);
  const all = new Set(fields.filter(isDataField).map((f) => f.key));

  if (row.stage_status === "completed") {
    if (canEditCompleted) return { mode: "open", lockedKeys: new Set(), message: null };
    return {
      mode: "locked",
      lockedKeys: all,
      message: "This entry is completed and locked. Only people with the “Edit completed entries” permission can change it.",
    };
  }
  if (!stage) return { mode: "locked", lockedKeys: all, message: "This entry is at a stage that no longer exists." };
  if (!isActor) {
    return { mode: "locked", lockedKeys: all, message: `Waiting for ${stage.name}. You can't change it until it reaches you.` };
  }
  const editable = editableKeysAt(fields, approval.stages, stage.id);
  return { mode: "stage", lockedKeys: new Set([...all].filter((k) => !editable.has(k))), message: null };
}

// What the person at this stage still has to do before they can approve:
// every visible field of the stage that is required (or required by a rule)
// and empty, plus the stage's signature. `row` = the saved entry;
// `fileKeys` = Set of upload field keys that have a file on this entry.
// Returns a list of plain-words problems (empty = fine to approve).
export function stageIncompleteProblems({ fields, approval, stageId, row, fileKeys }) {
  const stage = approval.stages.find((s) => s.id === stageId);
  if (!stage) return [];
  const answers = { ...row };
  // Multi-select and question tables are stored as JSON text; rules read them as lists / objects.
  for (const f of fields) {
    if (typeof answers[f.key] === "string" && (f.type === "multi-select" || f.type === "question-table")) {
      try {
        answers[f.key] = JSON.parse(answers[f.key]);
      } catch {
        /* leave as text */
      }
    }
  }
  const visible = evaluateVisibility(fields, answers);
  const editable = editableKeysAt(fields, approval.stages, stageId);
  const problems = [];
  for (const f of fields) {
    if (!isDataField(f) || !editable.has(f.key) || !visible.has(f.key)) continue;
    if (!isRequired(f, answers, visible, { fields })) continue;
    const empty = FILE_TYPES.has(f.type)
      ? !fileKeys.has(f.key)
      : answers[f.key] == null || answers[f.key] === "" || (Array.isArray(answers[f.key]) && answers[f.key].length === 0) || (f.type === "question-table" && Object.keys(answers[f.key] || {}).length === 0);
    if (empty) problems.push(`“${f.label || f.key}” needs to be filled in`);
  }
  if (stage.signature_field && !fileKeys.has(stage.signature_field)) {
    const sig = fields.find((f) => f.key === stage.signature_field);
    problems.push(`${stage.name} must sign first (“${sig?.label || stage.signature_field}”)`);
  }
  return problems;
}

// Publish check for the stages and the fields' `stage` props. Returns a
// plain-words message or null.
export function findApprovalProblems(settings, fields) {
  let parsed = settings;
  if (typeof settings === "string") {
    try {
      parsed = JSON.parse(settings);
    } catch {
      return "The approval settings couldn't be read. Open Form settings and set them again.";
    }
  }
  const raw = parsed && typeof parsed === "object" ? parsed.approval : null;
  if (!raw || !raw.enabled) return null;

  const stages = Array.isArray(raw.stages) ? raw.stages : [];
  if (stages.length < 2) return "Approval needs at least two stages — for example “Counsellor” and “Division Head”.";
  if (stages.length > MAX_STAGES) return `A form can have at most ${MAX_STAGES} approval stages.`;

  const ids = new Set();
  const names = new Set();
  for (const [i, s] of stages.entries()) {
    if (!s || !STAGE_ID_PATTERN.test(String(s.id))) return `Stage ${i + 1} couldn't be read. Remove it and add it again.`;
    if (ids.has(String(s.id))) return `Two stages share the same internal id. Remove one and add it again.`;
    ids.add(String(s.id));
    const name = String(s.name ?? "").trim();
    if (!name) return `Stage ${i + 1} needs a name.`;
    if (name.length > 100) return `Stage ${i + 1}'s name is too long (at most 100 characters).`;
    if (names.has(name.toLowerCase())) return `Two stages are called “${name}”. Give each stage its own name.`;
    names.add(name.toLowerCase());
    if (i > 0) {
      const users = Array.isArray(s.users) ? s.users.filter(Boolean) : [];
      const teams = Array.isArray(s.teams) ? s.teams.filter(Boolean) : [];
      if (users.length + teams.length === 0) return `Choose who works on “${name}” — nobody could approve that stage yet.`;
    }
  }

  const list = Array.isArray(fields) ? fields.filter((f) => f && typeof f === "object") : [];
  for (const f of list) {
    if (f.stage != null && f.stage !== "" && !ids.has(String(f.stage))) {
      return `“${f.label || f.key}” is set to a stage that was deleted. Pick another stage for it.`;
    }
  }
  for (const [i, s] of stages.entries()) {
    if (!s.signature_field) continue;
    const sig = list.find((f) => f.key === s.signature_field);
    if (!sig || sig.type !== "signature") return `The signature for “${String(s.name).trim()}” is a field that no longer exists. Pick another signature field.`;
    const at = list.find((f) => f.key === sig.key);
    const stageOfSig = at && at.stage && ids.has(String(at.stage)) ? String(at.stage) : String(stages[0].id);
    if (stageOfSig !== String(s.id)) {
      return `“${sig.label || sig.key}” is the signature of “${String(s.name).trim()}”, so it must be filled at that stage. Change the field's stage.`;
    }
    if (i === 0 && !sig) return `Stage 1's signature field is missing.`;
  }
  return null;
}
