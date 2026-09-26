import { QueryTypes } from "sequelize";
import companyModel from "../../models/company_setup/companyModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { formBuilderSubmissionFileModel } from "../../models/form_builder/formBuilderSubmissionFileModel.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { statusAndStagesLogsModel } from "../../models/common/statusAndStagesLogsModel.js";
import { emitAutomationEvent } from "../automation/emit.js";
import moment from "moment";
import {
  isValidFieldKey,
  mainTableName,
  repeaterTableName,
  NO_COLUMN_TYPES,
  LAYOUT_TYPES,
  FILE_TYPES,
  SERVER_OWNED_TYPES,
} from "./formBuilderDdlBuilder.js";
import { validateFormatPreset } from "./formBuilderFormatPresets.js";
import { isInternalOnlyField } from "./formBuilderLookups.js";
import { validateExtraFieldValue } from "./formBuilderExtraFieldValues.js";
import { applyReadRestrictions, computeRestrictions, resolveRestrictions, writeLockedKeys } from "./formBuilderFieldRestrictions.js";
import { approvalOf, approvalWriteState, editableKeysAt, initialStageState } from "./formBuilderApproval.js";
import {
  actorEntryScope,
  hasHandledEntry,
  isActorForRow,
  listStageLog,
  loadActorContext,
  logStageEvent,
  pendingForMeCondition,
} from "./formBuilderApprovalService.js";
import { applyCalculations } from "./formBuilderCalculations.js";
import { visibleQuestionIds, validateQuestionTableValue, scoreQuestionTable } from "./formBuilderQuestionTable.js";
import { resolveCustomerLabels } from "./formBuilderExtraMasters.js";
import {
  FORMAT_PRESET_TYPES,
  isEncryptedAadhaarField,
  isSensitiveStorageConfigured,
  isSensitiveStored,
  encryptSensitive,
  decryptSensitive,
  maskAadhaar,
  maskSensitiveValues,
  maskRepeaterRows,
} from "./formBuilderSensitiveValue.js";
import {
  relatedRecordExists,
  resolveMasterLabels,
  resolveRelatedRecordLabels,
} from "./formBuilderMasterRegistry.js";
import { resolveFormAccess } from "./formBuilderRights.js";
import { evaluateVisibility, isRequired } from "./formBuilderConditions.js";
import { isDateField, resolveDateValue, checkDateLimits, sameStoredDate } from "./formBuilderDateRules.js";
import { hasFormPermission, getMyFormPermissions } from "./formBuilderPermissions.js";
import { assignAutoNumber, validateManualAutoNumber } from "./formBuilderAutoNumber.js";
import { linkScheduleEntry } from "./formBuilderScheduleService.js";
import { deleteFinishedDraft } from "./formBuilderDraftService.js";
import loginModel from "../../models/application_login/loginModel.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { normalizeToTenDigit } from "../../utils/sharedFunctions.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";
import { logAuditEvent, listAuditLog } from "../company_setup/auditLogServices.js";

const MODULE_KEY = "form_builder";
const ENTITY_TYPE_SUBMISSION = "form_builder_submission";
const FORM_SUBMISSIONS_ORDER_TYPE = 13; // stageAndStatusMasterTableReference["form_builder_submissions"]

function parseSchema(json) {
  if (!json) return [];
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Every key passed here is either a validated field key (isValidFieldKey,
// lowercase-only by construction) or one of this file's own hardcoded
// fixed-column literals (never user input) — e.g. `isDelete`/`isActive`,
// which are legitimately mixed-case (a real bug caught live: the fallback
// regex below used to be lowercase-only, `/^[a-z][a-z0-9_]*$/`, and
// rejected those two with "Invalid identifier: isDelete"). Widened to
// allow mixed case in the fallback branch — still letters/digits/
// underscore only, still backtick-quoted, still not reachable from
// unvalidated user text.
function q(key) {
  if (!isValidFieldKey(key) && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
    throw new Error(`Invalid identifier: ${key}`);
  }
  return `\`${key}\``;
}

// ---------- Per-field validation (plan §4 "Server-side validation
// invariant" — load-bearing) ----------

// Empty for validation purposes. An empty question-table grid ([] / {})
// also counts as empty; other types keep the original null/"" rule (e.g.
// multi-select [] still stores "[]" as before).
function isEmptyValue(field, value) {
  if (value == null || value === "") return true;
  if (field.type === "question-table" && typeof value === "object") {
    return Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0;
  }
  return false;
}

function positiveIntOrError(field, value, message) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return { error: `${fieldName(field)}: ${message}` };
  return { value: num };
}

function fieldName(field) {
  return field.label || field.key;
}

// Field props this validator deliberately ignores: placeholder / content
// (display only) and the props reserved for later phases (conditions,
// required_conditions, edit_rule, auto_number, formula, questions,
// answer_columns, lookup_map) — they round-trip in schema_json untouched.
//
// isUpdate: editing an existing submission. Only matters for an encrypted
// Aadhaar field, where the client only ever saw the masked value — sending
// it back unchanged returns { keep: true } (leave the stored column as it
// is) instead of a value.
function validateScalarValue(field, value, { isUpdate = false } = {}) {
  // default_today (date/datetime): empty -> today / now, in the same
  // +05:30 zone the tenant Sequelize connections use (dbManager.js).
  if (isEmptyValue(field, value) && field.default_today) {
    if (field.type === "date") return { value: moment().utcOffset("+05:30").format("YYYY-MM-DD") };
    if (field.type === "datetime") return { value: new Date() };
  }

  // Consent tick (M2): unlike an ordinary checkbox, "not ticked" itself
  // fails a required consent — 0/false/"" all count as "hasn't agreed",
  // never silently stored as a valid "No".
  if (field.type === "consent") {
    const ticked = value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
    if (!ticked) {
      if (field.required !== false) return { error: `Please tick "${fieldName(field)}" to continue` };
      return { value: 0 };
    }
    return { value: 1 };
  }

  if (isEmptyValue(field, value)) {
    if (field.required) return { error: `${fieldName(field)} is required` };
    return { value: null };
  }

  if (isEncryptedAadhaarField(field)) return validateEncryptedAadhaar(field, value, isUpdate);

  if (field.format_preset && FORMAT_PRESET_TYPES.has(field.type)) {
    const preset = validateFormatPreset(field.format_preset, value);
    if (preset.error) return { error: `${fieldName(field)}: ${preset.error}` };
    return { value: preset.value };
  }

  // Time, Currency, Percentage, Location (Phase 7).
  const extra = validateExtraFieldValue(field, value);
  if (extra) return extra;

  switch (field.type) {
    case "number":
    case "rating":
    case "calculation": {
      // calculation: validated like a number for now — Phase 6 recomputes
      // it server-side from the formula instead of trusting the client.
      const num = Number(value);
      if (Number.isNaN(num)) return { error: `${fieldName(field)} must be a number` };
      if (field.min != null && num < field.min) return { error: `${fieldName(field)} must be at least ${field.min}` };
      if (field.max != null && num > field.max) return { error: `${fieldName(field)} must be at most ${field.max}` };
      return { value: num };
    }
    case "date":
    case "datetime": {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return { error: `${fieldName(field)} is not a valid date` };
      return { value: d };
    }
    case "checkbox":
    case "switch":
      return { value: value ? 1 : 0 };
    case "multi-select": {
      const arr = Array.isArray(value) ? value : [value];
      return { value: JSON.stringify(arr) };
    }
    case "reference": {
      const num = Number(value);
      if (!Number.isInteger(num)) return { error: `${fieldName(field)}: please pick a value from the list` };
      return { value: num };
    }
    case "customer-lookup":
      return positiveIntOrError(field, value, "please pick a customer from the list");
    case "user":
      return positiveIntOrError(field, value, "please pick a user from the list");
    case "question-table": {
      // Whole answer grid stored as JSON — object or array only.
      if (typeof value !== "object") return { error: `${fieldName(field)}: answers could not be read, please fill it again` };
      return { value: JSON.stringify(value) };
    }
    case "email": {
      const pattern = field.pattern ? new RegExp(field.pattern) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!pattern.test(String(value))) return { error: `${fieldName(field)} is not a valid email` };
      return { value: String(value) };
    }
    case "url": {
      const pattern = field.pattern ? new RegExp(field.pattern) : /^https?:\/\/.+/i;
      if (!pattern.test(String(value))) return { error: `${fieldName(field)} is not a valid link (it should start with http:// or https://)` };
      return { value: String(value) };
    }
    case "phone": {
      const pattern = field.pattern ? new RegExp(field.pattern) : /^[0-9+\-\s()]{6,20}$/;
      if (!pattern.test(String(value))) return { error: `${fieldName(field)} is not a valid phone number` };
      return { value: String(value) };
    }
    default: {
      const str = String(value);
      if (field.pattern && !new RegExp(field.pattern).test(str)) {
        return { error: `${fieldName(field)} is not in the expected format` };
      }
      if (field.min != null && str.length < field.min) return { error: `${fieldName(field)} must be at least ${field.min} characters` };
      if (field.max != null && str.length > field.max) return { error: `${fieldName(field)} must be at most ${field.max} characters` };
      return { value: str };
    }
  }
}

// Aadhaar with sensitive_storage "encrypted": same 12-digit rule as the
// preset, then stored encrypted (formBuilderSensitiveValue.js). Never falls
// back to plaintext when the key is missing.
function validateEncryptedAadhaar(field, value, isUpdate) {
  const preset = validateFormatPreset("aadhaar", value);
  if (preset.error) return { error: `${fieldName(field)}: ${preset.error}` };
  const compacted = String(value).replace(/[\s\-./]/g, "").toUpperCase();
  if (!/^[0-9]{12}$/.test(compacted)) {
    // The masked form (XXXXXXXX1234) — fine on edit (keep what's stored),
    // not on a new entry, where there's nothing stored to keep.
    if (isUpdate) return { keep: true };
    return { error: `${fieldName(field)}: Enter the full 12-digit Aadhaar number` };
  }
  if (!isSensitiveStorageConfigured()) {
    return {
      error: `Secure storage isn't set up on this server yet, so “${fieldName(field)}” can't be saved. Please contact the form owner.`,
    };
  }
  return { value: encryptSensitive(compacted) };
}

// Builds the validated {column: value} map for scalar top-level fields, and
// separately the repeater row sets — server always re-derives this from
// the form's *currently published* schema, never trusts a client-supplied
// field list (plan §4). isPublic drops visible_to:"internal" fields before
// anything else runs.
//
// Update only: existingRow (the stored main row) and existingRepeaterRows
// ({ repeaterKey: [storedChildRow, ...] }). A value that is just the masked
// display of what's stored (XXXXXXXX1234 for an encrypted "fbenc:" value)
// keeps the stored value — decided by the STORED value, so it also holds
// when the field was switched to "Last 4 digits only" (or lost its preset)
// after entries were saved. Repeaters are fully replaced on edit, so kept
// sub-field values are carried over from the stored row with the same id
// (or, if the client didn't send ids, the same position).
function keepsStoredValue(result, storedValue) {
  if (result.keep) return true;
  return isSensitiveStored(storedValue) && result.value != null && String(result.value) === maskAadhaar(storedValue);
}

// One scalar field's outcome, after the date edit rule (C2-C5) and the
// normal validator:
//   { set: value }  -> write this value
//   { keep: true }  -> leave the stored value (edit only)
//   { error }       -> plain message
// `required` is the field's effective requirement (required OR
// required_conditions met — formBuilderConditions.js isRequired).
function resolveFieldValue(field, rawValue, { required, isUpdate, storedValue, canChangeDates, isPublic, now }) {
  const effective = { ...field, required: !!required };

  if (isDateField(field)) {
    const decision = resolveDateValue(field, { isUpdate, storedValue, canChangeDates, isPublic, now });
    if (decision.action === "keep") return { keep: true };
    if (decision.action === "server") return { set: decision.value };
    const result = validateScalarValue(effective, rawValue, { isUpdate });
    if (result.error) return { error: result.error };
    // Limits only for a date the submitter picked — and never re-checked on
    // an edit that left the date as it was.
    if (result.value != null && !isEmptyValue(field, rawValue) && !(isUpdate && sameStoredDate(field, rawValue, storedValue))) {
      const limitMessage = checkDateLimits(field, rawValue, now);
      if (limitMessage) return { error: limitMessage };
    }
    return { set: result.value };
  }

  const result = validateScalarValue(effective, rawValue, { isUpdate });
  if (result.error) return { error: result.error };
  if (keepsStoredValue(result, storedValue)) return { keep: true };
  return { set: result.value };
}

// Conditional fields (D5): visibility is re-evaluated here from the
// submitted answers — the client's idea of what was hidden is never
// trusted. A hidden field is stored NULL (a hidden repeater stores no
// rows), is not validated, and is never required; a visible one is
// required when `required` is set or its required_conditions are met.
// Repeater sub-fields are evaluated per row (row answers + top level).
//
// Date edit rules (C2-C5): canChangeDates = this user has the form's
// "change_dates" permission (always false on the public path).
function buildValidatedAnswers({
  fields,
  answers,
  isPublic,
  isUpdate = false,
  existingRow = null,
  existingRepeaterRows = {},
  canChangeDates = false,
  writeLocked = null, // keys this user may not write (restricted fields, plan O8)
  now = new Date(),
}) {
  const columns = {};
  const errors = [];
  const repeaterRowSets = {}; // field.key -> [{col: val, ...}, ...]
  const questionStats = {}; // question-table key -> { score, max_score, answered }
  const safeAnswers = answers && typeof answers === "object" ? answers : {};

  // Public: internal-only fields are dropped before anything else runs, so
  // a rule pointing at one behaves exactly as on the public fill screen
  // (which never receives those fields).
  const scopeFields = isPublic ? fields.filter((f) => !isInternalOnlyField(f)) : fields;
  const visible = evaluateVisibility(scopeFields, safeAnswers);
  const outer = { fields: scopeFields, answers: safeAnswers, visible };

  for (const field of scopeFields) {
    if (LAYOUT_TYPES.has(field.type)) continue; // section-header / instruction: display only
    if (FILE_TYPES.has(field.type)) continue; // handled by attachUploadedFiles
    // Server-owned (auto-number): client value ignored and the column left
    // out entirely, so an edit never overwrites an assigned number.
    if (SERVER_OWNED_TYPES.has(field.type)) continue;
    // Restricted for this user: nothing is written (a create leaves it empty,
    // an edit keeps what is stored).
    if (writeLocked && writeLocked.has(field.key)) continue;
    // Calculations are worked out below from the validated answers — the
    // client's number is never used.
    if (field.type === "calculation") continue;

    const fieldVisible = visible.has(field.key);

    if (field.type === "repeater") {
      if (!fieldVisible) {
        repeaterRowSets[field.key] = []; // hidden: no rows kept
        continue;
      }
      const rows = Array.isArray(safeAnswers[field.key]) ? safeAnswers[field.key] : [];
      if (isRequired(field, safeAnswers, visible, { fields: scopeFields }) && rows.length === 0) {
        errors.push(`${field.label || field.key} needs at least one row`);
        continue;
      }
      const validatedRows = [];
      const storedRows = existingRepeaterRows[field.key] || [];
      const subFields = field.columns || [];
      rows.forEach((row, rowIndex) => {
        const rowAnswers = row && typeof row === "object" ? row : {};
        const rowVisible = evaluateVisibility(subFields, rowAnswers, outer);
        const stored = isUpdate
          ? (row?.id != null && storedRows.find((r) => String(r.id) === String(row.id))) || storedRows[rowIndex]
          : null;
        const rowCols = {};
        for (const subField of subFields) {
          if (FILE_TYPES.has(subField.type)) continue;
          if (NO_COLUMN_TYPES.has(subField.type)) continue;
          if (SERVER_OWNED_TYPES.has(subField.type)) continue;
          if (subField.type === "calculation") continue; // worked out below
          if (!rowVisible.has(subField.key)) {
            rowCols[subField.key] = null;
            continue;
          }
          const outcome = resolveFieldValue(subField, rowAnswers[subField.key], {
            required: isRequired(subField, rowAnswers, rowVisible, { fields: subFields, outer }),
            isUpdate,
            storedValue: stored ? stored[subField.key] : null,
            canChangeDates,
            isPublic,
            now,
          });
          if (outcome.error) {
            errors.push(`${field.label || field.key}: ${outcome.error}`);
            continue;
          }
          if (outcome.keep) {
            // Rows are fully replaced on edit, so "keep" copies the stored value.
            if (stored && stored[subField.key] != null) {
              rowCols[subField.key] = stored[subField.key];
            } else {
              errors.push(`${field.label || field.key}: ${fieldName(subField)}: Enter the full 12-digit Aadhaar number`);
            }
          } else {
            rowCols[subField.key] = outcome.set;
          }
        }
        validatedRows.push(rowCols);
      });
      repeaterRowSets[field.key] = validatedRows;
      continue;
    }

    if (NO_COLUMN_TYPES.has(field.type)) continue;

    if (!fieldVisible) {
      columns[field.key] = null; // hidden: cleared, not validated
      continue;
    }

    // Question table: answers checked per question; questions hidden by their
    // own rule are dropped and never required. An edit that doesn't send the
    // grid keeps the stored one.
    if (field.type === "question-table") {
      if (isUpdate && existingRow && safeAnswers[field.key] === undefined) {
        let keptGrid = null;
        try {
          keptGrid = existingRow[field.key] ? JSON.parse(existingRow[field.key]) : null;
        } catch {
          keptGrid = null;
        }
        questionStats[field.key] = scoreQuestionTable(field, keptGrid, visibleQuestionIds(field, safeAnswers, scopeFields, visible));
        continue;
      }
      const visibleIds = visibleQuestionIds(field, safeAnswers, scopeFields, visible);
      const result = validateQuestionTableValue(field, safeAnswers[field.key], {
        visibleIds,
        required: isRequired(field, safeAnswers, visible, { fields: scopeFields }),
      });
      if (result.error) {
        errors.push(result.error);
      } else {
        columns[field.key] = result.value == null ? null : JSON.stringify(result.value);
        questionStats[field.key] = scoreQuestionTable(field, result.value, visibleIds);
      }
      continue;
    }

    const outcome = resolveFieldValue(field, safeAnswers[field.key], {
      required: isRequired(field, safeAnswers, visible, { fields: scopeFields }),
      isUpdate,
      storedValue: existingRow ? existingRow[field.key] : null,
      canChangeDates,
      isPublic,
      now,
    });
    if (outcome.error) {
      errors.push(outcome.error);
    } else if (!outcome.keep) {
      columns[field.key] = outcome.set;
    }
  }

  // Calculations last, from the validated values (top level and per row).
  if (errors.length === 0) {
    applyCalculations({
      fields: scopeFields,
      answers: safeAnswers,
      visible,
      columns,
      repeaterRowSets,
      questionStats,
      stored: existingRow,
      now,
    });
  }

  return { columns, errors, repeaterRowSets, visibleKeys: visible };
}

// Upload fields that are hidden by a condition: their files are not stored
// (D5 — hidden fields are not stored). Top-level upload fields only;
// uploads inside repeaters are not supported by the fill screens.
function hiddenUploadKeys(fields, visibleKeys, isPublic) {
  return new Set(
    fields
      .filter((f) => FILE_TYPES.has(f.type))
      .filter((f) => (isPublic && isInternalOnlyField(f)) || !visibleKeys.has(f.key))
      .map((f) => f.key),
  );
}

// ---------- Duplicate / existing-customer detection (plan §4) ----------

async function matchExistingContact({ tenantDB, company_masters_id, email, phone }) {
  if (!email && !phone) return null;

  const companyRow = await companyModel.findOne({
    where: { id: company_masters_id, isDelete: 0 },
    attributes: ["is_contact_validation"],
  });
  if (!companyRow?.is_contact_validation) return null;

  const Contact = contactModel(tenantDB);
  const where = [];
  const replacements = { company_masters_id };
  if (phone) {
    const normalized = normalizeToTenDigit(phone);
    if (normalized) {
      where.push("mobile_number = :phone");
      replacements.phone = normalized;
    }
  }
  if (email) {
    where.push("email_id = :email");
    replacements.email = email;
  }
  if (where.length === 0) return null;

  const [row] = await tenantDB.query(
    `SELECT id FROM contact_masters WHERE company_masters_id = :company_masters_id AND isDelete = 0 AND (${where.join(" OR ")}) LIMIT 1`,
    { replacements, type: QueryTypes.SELECT },
  );
  return row?.id || null;
}

// ---------- Create submission (shared by internal + public paths, plan §4) ----------

export async function createFormSubmission({
  tenantDB,
  form,
  company_masters_id,
  submittedByType, // "internal" | "public"
  a_application_login_id, // internal only
  submitterName,
  submitterEmail,
  submitterPhone,
  answers,
  relatedRecordId, // internal only — always ignored on public path
  sourceIp,
  canChangeDates = false, // form's "change_dates" permission — internal only
  canOverrideAutoNumber = false, // form's "override_auto_number" permission — internal only
  writeLocked = null, // restricted fields this user may not fill (plan O8)
  leadSource = null, // public form only (plan M6) — from the link's ?source= / ?utm_source=
  leadCampaign = null, // public form only (plan M6) — from the link's ?campaign= / ?utm_campaign=
  importTag = null, // internal only (plan Q3) — an Excel-imported entry is marked source "excel-import", campaign = this batch label
  dryRun = false, // check everything, save nothing (import preview)
}) {
  const fields = parseSchema(form.published_schema_json);
  if (fields.length === 0) {
    throw Object.assign(new Error("This form is not published yet"), { code: 400 });
  }

  const isPublic = submittedByType === "public";

  // Approval stages (plan I): creating the entry is stage 1's work — the fields
  // of later stages are left for the people at those stages.
  const approval = approvalOf(form.published_settings_json);
  let createLocked = writeLocked;
  if (approval.enabled) {
    const firstStageKeys = editableKeysAt(fields, approval.stages, approval.stages[0].id);
    const laterStageKeys = fields.filter((f) => f.key && !firstStageKeys.has(f.key)).map((f) => f.key);
    createLocked = new Set([...(writeLocked || []), ...laterStageKeys]);
  }
  const { columns, errors, repeaterRowSets, visibleKeys } = buildValidatedAnswers({
    fields,
    answers,
    isPublic,
    canChangeDates: isPublic ? false : !!canChangeDates,
    writeLocked: createLocked,
  });
  if (errors.length > 0) {
    throw Object.assign(new Error(errors.join("; ")), { code: 400 });
  }

  // Honeypot (plan §2 spam guard) — silently drop, don't error, so a bot
  // doesn't learn its check failed.
  const honeypotField = fields.find((f) => f.type === "honeypot");
  if (honeypotField && answers?.[honeypotField.key]) {
    return { dropped: true };
  }

  // match_key -> populate submitter_email/submitter_phone from a tagged
  // field, on BOTH paths (plan §4 duplicate-detection note).
  let resolvedEmail = submitterEmail || null;
  let resolvedPhone = submitterPhone || null;
  // An encrypted Aadhaar field is never used for matching — its column
  // holds ciphertext, not something to copy into submitter_email/phone.
  const emailMatchField = fields.find((f) => f.match_key === "email" && !isEncryptedAadhaarField(f));
  const phoneMatchField = fields.find((f) => f.match_key === "phone" && !isEncryptedAadhaarField(f));
  if (emailMatchField && columns[emailMatchField.key]) resolvedEmail = columns[emailMatchField.key];
  if (phoneMatchField && columns[phoneMatchField.key]) resolvedPhone = columns[phoneMatchField.key];

  // related_record_id: public path never sets it, regardless of what was
  // passed in — server-enforced, not just UI (plan §1/§4 load-bearing rule).
  let finalRelatedRecordId = isPublic ? null : relatedRecordId || null;
  // A Contact form with a Customer lookup: the chosen customer becomes the
  // linked record when none was picked explicitly (plan F4).
  if (!isPublic && !finalRelatedRecordId && form.related_module === "contact") {
    const lookupField = fields.find((f) => f.type === "customer-lookup" && columns[f.key]);
    if (lookupField) finalRelatedRecordId = columns[lookupField.key];
  }
  if (finalRelatedRecordId && form.related_module) {
    const exists = await relatedRecordExists({
      tenantDB,
      relatedModule: form.related_module,
      recordId: finalRelatedRecordId,
    });
    if (!exists) {
      throw Object.assign(new Error("The linked record could not be found — it may have been deleted. Pick it again."), { code: 400 });
    }
  } else if (isPublic) {
    finalRelatedRecordId = null;
  }

  // Duplicate/existing-customer detection — advisory only, never
  // auto-links (plan §4). Only when related_module is contact and no
  // explicit link was already made.
  let possibleDuplicateContactId = null;
  if (form.related_module === "contact" && !finalRelatedRecordId) {
    possibleDuplicateContactId = await matchExistingContact({
      tenantDB,
      company_masters_id,
      email: resolvedEmail,
      phone: resolvedPhone,
    });
  }

  // It then waits at stage 2.
  const initialStage = approval.enabled ? initialStageState(approval.stages) : null;

  // Consent (plan M2): the moment and IP are stamped whenever a ticked
  // consent field is on the form, never just trusted from the client.
  const consentField = fields.find((f) => f.type === "consent" && columns[f.key] === 1);

  const mainTable = mainTableName(form.id);
  const insertColumns = {
    company_masters_id,
    form_version: form.version,
    submitted_by_type: submittedByType,
    submitted_by_a_application_login_id: isPublic ? null : a_application_login_id || null,
    submitter_name: submitterName || null,
    submitter_email: resolvedEmail,
    submitter_phone: resolvedPhone,
    related_module: form.related_module || null,
    related_record_id: finalRelatedRecordId,
    possible_duplicate_contact_id: possibleDuplicateContactId,
    source_ip: isPublic ? sourceIp || null : null,
    consent_at: consentField ? new Date() : null,
    consent_ip: consentField && isPublic ? sourceIp || null : null,
    source: isPublic ? leadSource || null : importTag ? "excel-import" : null,
    campaign: isPublic ? leadCampaign || null : importTag || null,
    created_date_time: new Date(),
    isDelete: 0,
    isActive: 1,
    ...(initialStage || {}),
    ...columns,
  };

  // Auto-number fields (plan item B): the number is taken inside the same
  // transaction as the insert, so a failed save never burns a number and
  // two parallel saves never get the same one. A hidden (condition) or
  // internal-only-on-public field gets no number. A typed number is only
  // honoured for users with the form's override permission.
  const autoNumberFields = fields.filter(
    (f) =>
      f.type === "auto-number" &&
      !(isPublic && isInternalOnlyField(f)) &&
      (!visibleKeys || visibleKeys.has(f.key)),
  );
  const manualNumbers = {};
  for (const f of autoNumberFields) {
    const typed = answers?.[f.key];
    if (canOverrideAutoNumber && !isPublic && typed != null && String(typed).trim() !== "") {
      const manual = validateManualAutoNumber(f, typed);
      if (manual.error) throw Object.assign(new Error(manual.error), { code: 400 });
      manualNumbers[f.key] = manual.value;
    }
  }

  if (dryRun) return { dryRun: true };

  let insertId;
  try {
    insertId = await tenantDB.transaction(async (transaction) => {
      for (const f of autoNumberFields) {
        const number =
          f.key in manualNumbers
            ? manualNumbers[f.key]
            : await assignAutoNumber({ tenantDB, transaction, company_masters_id, form_id: form.id, field: f, answers });
        insertColumns[f.key] = number;
      }
      const insertKeys = Object.keys(insertColumns);
      const [result] = await tenantDB.query(
        `INSERT INTO \`${mainTable}\` (${insertKeys.map((k) => q(k)).join(", ")}) VALUES (${insertKeys.map((k) => `:${k}`).join(", ")})`,
        { replacements: insertColumns, type: QueryTypes.INSERT, transaction },
      );

      // Repeater rows — one INSERT per row per repeater field.
      for (const field of fields) {
        if (field.type !== "repeater") continue;
        const rows = repeaterRowSets[field.key] || [];
        if (rows.length === 0) continue;
        const childTable = repeaterTableName(form.id, field.id);
        let rowOrder = 0;
        for (const row of rows) {
          const rowColumns = { submission_id: result, row_order: rowOrder++, ...row };
          const rowKeys = Object.keys(rowColumns);
          await tenantDB.query(
            `INSERT INTO \`${childTable}\` (${rowKeys.map((k) => q(k)).join(", ")}) VALUES (${rowKeys.map((k) => `:${k}`).join(", ")})`,
            { replacements: rowColumns, type: QueryTypes.INSERT, transaction },
          );
        }
      }
      if (initialStage) {
        await logStageEvent({
          tenantDB,
          transaction,
          company_masters_id,
          form_id: form.id,
          submission_id: result,
          stage: approval.stages[0],
          action: "submit",
          loginId: isPublic ? null : a_application_login_id,
        });
      }
      return result;
    });
  } catch (dbError) {
    // Friendly "already submitted" for a `unique` field's constraint
    // violation, not a raw SQL error surfacing to the filler (plan §1).
    if (dbError.original?.code === "ER_DUP_ENTRY" || dbError.parent?.code === "ER_DUP_ENTRY") {
      throw Object.assign(new Error("This has already been submitted — an entry with the same value already exists."), { code: 409 });
    }
    throw dbError;
  }

  emitAutomationEvent({ tenantDB, company_masters_id }, "form.submitted", {
    id: insertId,
    origin: submittedByType === "public" ? "import" : "user",
  });

  return {
    submissionId: insertId,
    possibleDuplicateContactId,
    // Upload fields hidden by a condition — callers drop their files.
    hiddenUploadKeys: hiddenUploadKeys(fields, visibleKeys, isPublic),
  };
}

// ---------- File attachment (plan §3) ----------

// Files added / removed while EDITING an entry (Phase 6b, G5). Body carries
// `remove_file_ids` (JSON list of file ids to drop) and the multipart files
// themselves. A single-file field, signature or image REPLACES what it had;
// a "multiple files" field keeps its old files and adds the new ones. Only
// top-level upload fields of this form are accepted, and a field hidden by a
// "show only when" rule takes no new files.
// Returns { removed: [names], added: [names] } for the audit log.
async function applyFileChanges({ req, form, fields, id, company_masters_id, visibleKeys, uploadedFiles, writeLocked = null }) {
  const FileModel = formBuilderSubmissionFileModel(req.tenantDB);
  const uploadFields = new Map(fields.filter((f) => FILE_TYPES.has(f.type)).map((f) => [f.key, f]));
  const changes = { removed: [], added: [] };

  let removeIds = req.body?.remove_file_ids;
  if (typeof removeIds === "string") {
    try {
      removeIds = JSON.parse(removeIds);
    } catch {
      removeIds = [];
    }
  }
  removeIds = (Array.isArray(removeIds) ? removeIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (removeIds.length > 0) {
    const rows = await FileModel.findAll({ where: { id: removeIds, submission_id: id, form_id: form.id, isDelete: 0 } });
    for (const row of rows) {
      // A file of a field this person may not change stays (restricted field / another stage's field).
      if (writeLocked && writeLocked.has(row.field_key)) continue;
      await row.update({ isDelete: 1 });
      changes.removed.push(row.original_file_name);
    }
  }

  const hidden = hiddenUploadKeys(fields, visibleKeys || new Set(), false);
  const accepted = (uploadedFiles || []).filter((file) => uploadFields.has(file.fieldname) && !hidden.has(file.fieldname) && !(writeLocked && writeLocked.has(file.fieldname)));
  if (accepted.length > 0) {
    const replaceKeys = new Set(
      accepted
        .filter((file) => {
          const f = uploadFields.get(file.fieldname);
          return !(f.type === "file" && f.multiple);
        })
        .map((file) => file.fieldname),
    );
    for (const key of replaceKeys) {
      const old = await FileModel.findAll({ where: { submission_id: id, form_id: form.id, field_key: key, isDelete: 0 } });
      for (const row of old) {
        await row.update({ isDelete: 1 });
        changes.removed.push(row.original_file_name);
      }
    }
    await attachUploadedFiles({ tenantDB: req.tenantDB, company_masters_id, form_id: form.id, submission_id: id, files: accepted });
    changes.added = accepted.map((file) => file.originalname);
  }
  return changes;
}


// skipFieldKeys: upload fields hidden by a condition (createFormSubmission's
// hiddenUploadKeys) — their files are not stored.
export async function attachUploadedFiles({ tenantDB, company_masters_id, form_id, submission_id, files, skipFieldKeys = null }) {
  if (!files || files.length === 0) return;
  const FileModel = formBuilderSubmissionFileModel(tenantDB);
  for (const file of files) {
    if (skipFieldKeys && skipFieldKeys.has(file.fieldname)) continue;
    await FileModel.create({
      company_masters_id,
      form_id,
      submission_id,
      field_key: file.fieldname,
      file_type: file.file_type || "file",
      original_file_name: file.originalname,
      stored_file_name: file.filename,
      file_path: file.path?.split("media-folder/")[1]
        ? `media-folder/${file.path.split("media-folder/")[1]}`
        : file.path,
      mime_type: file.mimetype,
      file_size: file.size,
      created_date_time: new Date(),
    });
  }
}

// ---------- Internal fill entry point (thin wrapper over the shared
// createFormSubmission, plan §4 — same shape as submitPublicForm in
// formBuilderPublicService.js, just resolved via authenticateToken +
// tenantMiddleware instead of qrCode/shareToken) ----------

export const createInternalSubmissionEntry = async (req) => {
  try {
    const a_application_login_id = req.body?.a_application_login_id;
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company) return resError({ ack_msg: "Company not found for login ID" });
    const company_masters_id = company.company_masters_id;

    const FormModel = formBuilderFormModel(req.tenantDB);
    const form_id = req.body?.form_id || req.body?.formId;
    const form = await FormModel.findOne({ where: { id: form_id, company_masters_id, isDelete: 0 } });
    if (!form || !form.published_schema_json) return resError({ ack_msg: "Form not found or not published" });

    const access = await resolveFormAccess({ form, company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
    if (!access.canFill) return resError({ code: 403, ack_msg: "No access to fill this form" });

    const { answers, submitter_name, submitter_email, submitter_phone, related_record_id } = req.body || {};
    const parsedAnswers = typeof answers === "string" ? JSON.parse(answers) : answers;

    const canChangeDates = await hasFormPermission({
      form,
      permissionKey: "change_dates",
      loginId: a_application_login_id,
      company_masters_id,
      tenantDB: req.tenantDB,
    });

    const canOverrideAutoNumber = await hasFormPermission({
      form,
      permissionKey: "override_auto_number",
      loginId: a_application_login_id,
      company_masters_id,
      tenantDB: req.tenantDB,
    });

    const restrictions = await resolveRestrictions({
      form,
      fields: parseSchema(form.published_schema_json),
      loginId: a_application_login_id,
      company_masters_id,
      tenantDB: req.tenantDB,
    });

    let result;
    try {
      result = await createFormSubmission({
        canChangeDates,
        canOverrideAutoNumber,
        writeLocked: writeLockedKeys(restrictions),
        tenantDB: req.tenantDB,
        form,
        company_masters_id,
        submittedByType: "internal",
        a_application_login_id,
        submitterName: submitter_name,
        submitterEmail: submitter_email,
        submitterPhone: submitter_phone,
        answers: parsedAnswers,
        relatedRecordId: related_record_id,
      });
    } catch (submissionError) {
      return resError({ code: submissionError.code || 500, ack_msg: submissionError.message });
    }

    if (req.files?.length) {
      await attachUploadedFiles({
        tenantDB: req.tenantDB,
        company_masters_id,
        form_id: form.id,
        submission_id: result.submissionId,
        files: req.files,
        skipFieldKeys: result.hiddenUploadKeys,
      });
    }

    // The entry came from a saved draft (plan M7): the draft has done its job.
    if (req.body?.draft_id) {
      try {
        await deleteFinishedDraft({ tenantDB: req.tenantDB, company_masters_id, form_id: form.id, loginId: a_application_login_id, draftId: req.body.draft_id });
      } catch (draftError) {
        console.error("deleteFinishedDraft error:", draftError);
      }
    }

    // A form set up as a recurring schedule (plan Q1): this entry answers the person's due day.
    try {
      await linkScheduleEntry({
        tenantDB: req.tenantDB,
        company_masters_id,
        form_id: form.id,
        loginId: a_application_login_id,
        submissionId: result.submissionId,
        entryId: req.body?.schedule_entry_id,
      });
    } catch (linkError) {
      console.error("linkScheduleEntry error:", linkError);
    }

    return resSuccess({ ack_msg: "Submission created", data: { item: { id: result.submissionId } } });
  } catch (e) {
    console.error("createInternalSubmissionEntry error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// ---------- List / get / search (plan §4 "Search & filter") ----------

async function loadFormForAccess(req, { requireField = false } = {}) {
  const a_application_login_id = req.body?.a_application_login_id;
  const company = await getCompanyByLoginId(a_application_login_id);
  if (!company) return { error: resError({ ack_msg: "Company not found for login ID" }) };
  const company_masters_id = company.company_masters_id;

  const form_id = req.body?.form_id || req.body?.formId;
  const FormModel = formBuilderFormModel(req.tenantDB);
  const form = await FormModel.findOne({ where: { id: form_id, company_masters_id, isDelete: 0 } });
  if (!form) return { error: resError({ ack_msg: "Form not found" }) };
  if (requireField && !form.published_schema_json) {
    return { error: resError({ ack_msg: "This form is not published" }) };
  }

  const access = await resolveFormAccess({ form, company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
  return { form, company_masters_id, a_application_login_id, access };
}

// Stage names and which stages this user works on, for the list / entry screens.
function approvalSummary(ctx) {
  if (!ctx.approval.enabled) return { enabled: false };
  return {
    enabled: true,
    stages: ctx.approval.stages.map(({ id, name }) => ({ id, name })),
    my_stage_ids: ctx.owner ? ctx.approval.stages.map((s) => s.id) : ctx.myStageIds,
  };
}

export const listSubmissions = async (req) => {
  try {
    const { form, company_masters_id, a_application_login_id, access, error } = await loadFormForAccess(req);
    if (error) return error;
    // No general access: a stage's people still see the entries waiting for them (and ones they handled).
    const actorCtx = await loadActorContext({ form, loginId: a_application_login_id, company_masters_id });
    const actorScope = access.submissionsScope === "none" ? actorEntryScope(actorCtx, form.id) : null;
    if (access.submissionsScope === "none" && !actorScope) {
      return resSuccess({ data: { item: [], can_reveal_sensitive: false, can_change_dates: false } });
    }

    const table = mainTableName(form.id);
    const fields = parseSchema(form.published_schema_json);
    const perms = await getMyFormPermissions({ form, loginId: a_application_login_id, company_masters_id, tenantDB: req.tenantDB });
    // Restricted fields (plan O8): hidden / masked for this user, and never
    // searched or filtered on — that would leak the value they can't see.
    const restricted = computeRestrictions(fields, perms.see_masked_fields);
    const noRead = new Set([...restricted.hidden, ...restricted.masked]);
    // Encrypted Aadhaar columns hold ciphertext — never filtered or
    // searched on (a LIKE could otherwise hit random ciphertext bytes).
    const filterableFields = fields.filter(
      (f) => f.filterable && !NO_COLUMN_TYPES.has(f.type) && !isEncryptedAadhaarField(f) && !noRead.has(f.key),
    );

    const whereClauses = ["isDelete = 0"];
    const replacements = {};

    if (access.submissionsScope === "own") {
      whereClauses.push("submitted_by_a_application_login_id = :ownLoginId");
      replacements.ownLoginId = a_application_login_id;
    }
    if (actorScope) {
      whereClauses.push(actorScope.sql);
      Object.assign(replacements, actorScope.replacements);
    }

    const { filters, search, limit, offset } = req.body || {};
    if (filters && typeof filters === "object") {
      for (const [key, value] of Object.entries(filters)) {
        const fixedCols = ["submission_status_id", "related_record_id", "submitted_by_type"];
        const isFixed = fixedCols.includes(key);
        const isFilterable = filterableFields.some((f) => f.key === key);
        if (!isFixed && !isFilterable) continue;
        whereClauses.push(`${q(key)} = :filter_${key}`);
        replacements[`filter_${key}`] = value;
      }
      if (filters.possible_duplicate_contact_id_not_null) {
        whereClauses.push("possible_duplicate_contact_id IS NOT NULL");
      }
      // "Pending for me": entries waiting for this person at their stage.
      if (filters.pending_for_me) {
        const pending = pendingForMeCondition(actorCtx);
        whereClauses.push(pending ? pending.sql : "1 = 0");
        if (pending) Object.assign(replacements, pending.replacements);
      }
      if (filters.stage_status && ["pending", "sent_back", "completed"].includes(filters.stage_status)) {
        whereClauses.push("stage_status = :filterStageStatus");
        replacements.filterStageStatus = filters.stage_status;
      }
    }

    if (search) {
      const searchCols = ["submitter_name", "submitter_email", "submitter_phone", ...filterableFields
        .filter((f) => ["text", "textarea", "phone", "email", "url", "auto-number"].includes(f.type))
        .map((f) => f.key)];
      // Stored "fbenc:" values (encrypted Aadhaar, including fields since
      // switched to another mode) are never matched.
      const likeClauses = searchCols.map((col, i) => {
        replacements[`search_${i}`] = `%${search}%`;
        return `(${q(col)} LIKE :search_${i} AND ${q(col)} NOT LIKE 'fbenc:%')`;
      });
      whereClauses.push(`(${likeClauses.join(" OR ")})`);
    }

    const finalLimit = Math.min(Number(limit) || 50, 500);
    const finalOffset = Number(offset) || 0;

    const rows = await req.tenantDB.query(
      `SELECT * FROM \`${table}\` WHERE ${whereClauses.join(" AND ")} ORDER BY created_date_time DESC LIMIT ${finalLimit} OFFSET ${finalOffset}`,
      { replacements, type: QueryTypes.SELECT },
    );

    const enriched = await enrichSubmissionRows({ tenantDB: req.tenantDB, form, fields, rows });
    return resSuccess({
      data: {
        item: enriched.map((r) => applyReadRestrictions(r, restricted)),
        restricted,
        approval: approvalSummary(actorCtx),
        can_reveal_sensitive: perms.see_masked_fields,
        can_change_dates: perms.change_dates,
      },
    });
  } catch (e) {
    console.error("listSubmissions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Who may see the full number behind an encrypted Aadhaar field: the
// form's per-form "see_masked_fields" permission (plan O8 / section 3) —
// the company owner always has it (formBuilderPermissions.js).
async function canRevealSensitive({ form, a_application_login_id, company_masters_id, tenantDB }) {
  return hasFormPermission({
    form,
    permissionKey: "see_masked_fields",
    loginId: a_application_login_id,
    company_masters_id,
    tenantDB,
  });
}

// login id -> username (master DB), batched. Used for the system columns
// "created by" / "last modified by" (plan C4).
async function resolveLoginNames(ids) {
  const uniqueIds = [...new Set((ids || []).filter((id) => id != null && id !== ""))];
  if (uniqueIds.length === 0) return {};
  const rows = await loginModel.findAll({ where: { id: uniqueIds }, attributes: ["id", "username"], raw: true });
  const map = {};
  for (const r of rows) map[r.id] = r.username || null;
  return map;
}

// Resolves reference-field ids, submission_status_id, and related_record_id
// to display labels — batched, never one query per row (plan §1). Also
// masks encrypted Aadhaar values (XXXXXXXX1234) — every row a read path
// returns goes through here. Adds the system dates block (plan C4):
// _created_by_name / _last_edited_by_name next to the stored
// created_date_time / submitted_by_a_application_login_id /
// last_edited_date_time / last_edited_by_a_application_login_id columns.
async function enrichSubmissionRows({ tenantDB, form, fields, rows }) {
  if (rows.length === 0) return rows;
  rows = rows.map((row) => maskSensitiveValues(fields, row));

  // Reference, User (team member) and Customer lookup fields all save an id;
  // their readable label is resolved here in one batch per field.
  const referenceFields = fields.filter((f) => f.type === "reference" || f.type === "user" || f.type === "customer-lookup");
  const labelMaps = {};
  for (const field of referenceFields) {
    const ids = rows.map((r) => r[field.key]).filter((v) => v != null);
    if (field.type === "customer-lookup") labelMaps[field.key] = await resolveCustomerLabels({ tenantDB, ids });
    else labelMaps[field.key] = await resolveMasterLabels({ tenantDB, master: field.type === "user" ? "user" : field.master, ids });
  }

  const statusIds = rows.map((r) => r.submission_status_id).filter((v) => v != null);
  let statusMap = {};
  if (statusIds.length > 0) {
    const StatusModel = stagestatusModel(tenantDB);
    const statusRows = await StatusModel.findAll({
      where: { id: statusIds },
      attributes: ["id", "name", "color"],
      raw: true,
    });
    statusMap = Object.fromEntries(statusRows.map((s) => [s.id, { name: s.name, color: s.color }]));
  }

  let relatedLabelMap = {};
  if (form.related_module) {
    const relatedIds = rows.map((r) => r.related_record_id).filter((v) => v != null);
    relatedLabelMap = await resolveRelatedRecordLabels({ tenantDB, relatedModule: form.related_module, ids: relatedIds });
  }

  const loginNames = await resolveLoginNames(
    rows.flatMap((r) => [r.submitted_by_a_application_login_id, r.last_edited_by_a_application_login_id]),
  );
  const publicName = (row) => (row.submitted_by_type === "public" ? row.submitter_name || "Public form" : null);

  return rows.map((row) => ({
    ...row,
    _created_by_name:
      row.submitted_by_a_application_login_id != null
        ? loginNames[row.submitted_by_a_application_login_id] || "(removed user)"
        : publicName(row),
    _last_edited_by_name:
      row.last_edited_by_a_application_login_id != null
        ? loginNames[row.last_edited_by_a_application_login_id] || "(removed user)"
        : null,
    _reference_labels: Object.fromEntries(
      referenceFields.map((f) => [f.key, row[f.key] != null ? labelMaps[f.key][row[f.key]] : null]),
    ),
    _status: row.submission_status_id != null ? statusMap[row.submission_status_id] : null,
    _related_record_label: row.related_record_id != null ? relatedLabelMap[row.related_record_id] : null,
  }));
}

export const getSubmission = async (req) => {
  try {
    const { form, company_masters_id, a_application_login_id, access, error } = await loadFormForAccess(req);
    if (error) return error;
    const actorCtx = await loadActorContext({ form, loginId: a_application_login_id, company_masters_id });

    const table = mainTableName(form.id);
    const { id } = req.body || {};
    const [row] = await req.tenantDB.query(
      `SELECT * FROM \`${table}\` WHERE id = :id AND isDelete = 0 LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!row) return resError({ ack_msg: "Submission not found" });

    // No general access, but the entry is waiting for this person (or they handled it before): they may open it.
    if (access.submissionsScope === "none") {
      const mayOpen = isActorForRow(actorCtx, row) || (await hasHandledEntry({ tenantDB: req.tenantDB, form_id: form.id, submission_id: row.id, loginId: a_application_login_id }));
      if (!mayOpen) return resError({ code: 403, ack_msg: "No access to this submission" });
    } else if (access.submissionsScope === "own" && String(row.submitted_by_a_application_login_id) !== String(req.body?.a_application_login_id)) {
      return resError({ code: 403, ack_msg: "No access to this submission" });
    }

    const fields = parseSchema(form.published_schema_json);
    const repeaterRows = {};
    for (const field of fields) {
      if (field.type !== "repeater") continue;
      const childTable = repeaterTableName(form.id, field.id);
      repeaterRows[field.key] = await req.tenantDB.query(
        `SELECT * FROM \`${childTable}\` WHERE submission_id = :id ORDER BY row_order ASC`,
        { replacements: { id }, type: QueryTypes.SELECT },
      );
    }

    const [enriched] = await enrichSubmissionRows({ tenantDB: req.tenantDB, form, fields, rows: [row] });
    const perms = await getMyFormPermissions({ form, loginId: a_application_login_id, company_masters_id, tenantDB: req.tenantDB });
    // Attached files / signatures / images (path is relative to the backend's media-folder URL).
    const fileRows = await formBuilderSubmissionFileModel(req.tenantDB).findAll({
      where: { submission_id: id, form_id: form.id, isDelete: 0 },
      attributes: ["id", "field_key", "file_type", "original_file_name", "file_path", "mime_type", "file_size"],
      order: [["id", "ASC"]],
      raw: true,
    });
    const restricted = computeRestrictions(fields, perms.see_masked_fields);

    // Approval stages: where the entry is, what this person may do with it, and its history.
    let approval = { enabled: false };
    if (actorCtx.approval.enabled) {
      const isActor = isActorForRow(actorCtx, row);
      const writeState = approvalWriteState({ approval: actorCtx.approval, fields, row, isActor, canEditCompleted: perms.edit_completed });
      const stageIndex = actorCtx.approval.stages.findIndex((s) => s.id === row.current_stage);
      approval = {
        ...approvalSummary(actorCtx),
        current_stage: row.current_stage || null,
        stage_status: row.stage_status || null,
        can_act: isActor,
        can_send_back: isActor && stageIndex > 0,
        write_mode: writeState.mode,
        locked_keys: [...writeState.lockedKeys],
        message: writeState.message,
        log: await listStageLog({ tenantDB: req.tenantDB, form_id: form.id, submission_id: row.id }),
      };
    }
    return resSuccess({
      data: {
        restricted,
        approval,
        item: applyReadRestrictions({ ...enriched, _repeaters: maskRepeaterRows(fields, repeaterRows), _files: fileRows }, restricted),
        can_reveal_sensitive: perms.see_masked_fields,
        can_change_dates: perms.change_dates,
      },
    });
  } catch (e) {
    console.error("getSubmission error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// ---------- Edit submission (plan §4 "Edit submission") ----------

export const updateFormSubmission = async (req) => {
  try {
    const { form, company_masters_id, access, error } = await loadFormForAccess(req);
    if (error) return error;
    // Not general fill access? A stage's people may still edit the entries waiting for them (checked below).
    const noFillAccess = !access.canFill;

    const table = mainTableName(form.id);
    const { id, answers, related_record_id, expected_last_edited_date_time } = req.body || {};

    const [existing] = await req.tenantDB.query(
      `SELECT * FROM \`${table}\` WHERE id = :id AND isDelete = 0 LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!existing) return resError({ ack_msg: "Submission not found" });

    // Approval stages (plan I): who may change what right now.
    const loginId = req.body?.a_application_login_id;
    const actorCtx = await loadActorContext({ form, loginId, company_masters_id });
    const actorOk = isActorForRow(actorCtx, existing);
    if (noFillAccess && !actorOk) return resError({ code: 403, ack_msg: "No edit access to this form's submissions" });
    const canEditCompleted = await hasFormPermission({ form, permissionKey: "edit_completed", loginId, company_masters_id, tenantDB: req.tenantDB });

    // Concurrent-edit guard — reuses last_edited_date_time (plan §4).
    const existingStamp = existing.last_edited_date_time ? new Date(existing.last_edited_date_time).getTime() : null;
    const expectedStamp = expected_last_edited_date_time ? new Date(expected_last_edited_date_time).getTime() : null;
    if (existingStamp && expectedStamp && existingStamp !== expectedStamp) {
      return resError({ code: 409, ack_msg: "This submission was edited by someone else — reload and try again" });
    }

    const fields = parseSchema(form.published_schema_json);

    // Stored child rows — lets a masked Aadhaar value sent back on edit keep
    // its stored (encrypted) number when the rows are replaced below.
    const existingRepeaterRows = {};
    for (const field of fields) {
      if (field.type !== "repeater") continue;
      existingRepeaterRows[field.key] = await req.tenantDB.query(
        `SELECT * FROM \`${repeaterTableName(form.id, field.id)}\` WHERE submission_id = :id ORDER BY row_order ASC`,
        { replacements: { id }, type: QueryTypes.SELECT },
      );
    }

    const canChangeDates = await hasFormPermission({
      form,
      permissionKey: "change_dates",
      loginId: req.body?.a_application_login_id,
      company_masters_id,
      tenantDB: req.tenantDB,
    });
    const parsedAnswers = typeof answers === "string" ? JSON.parse(answers) : answers;
    const restrictions = await resolveRestrictions({
      form,
      fields,
      loginId: req.body?.a_application_login_id,
      company_masters_id,
      tenantDB: req.tenantDB,
    });
    const writeState = approvalWriteState({ approval: actorCtx.approval, fields, row: existing, isActor: actorOk, canEditCompleted });
    if (writeState.mode === "locked") return resError({ code: 403, ack_msg: writeState.message });
    const combinedLocked = new Set([...writeLockedKeys(restrictions), ...writeState.lockedKeys]);
    const { columns, errors, repeaterRowSets, visibleKeys } = buildValidatedAnswers({
      fields,
      answers: parsedAnswers,
      isPublic: false,
      isUpdate: true,
      writeLocked: combinedLocked,
      existingRow: existing,
      existingRepeaterRows,
      canChangeDates,
    });
    if (errors.length > 0) return resError({ ack_msg: errors.join("; ") });

    let finalRelatedRecordId = existing.related_record_id;
    if (related_record_id !== undefined) {
      if (related_record_id && form.related_module) {
        const exists = await relatedRecordExists({ tenantDB: req.tenantDB, relatedModule: form.related_module, recordId: related_record_id });
        if (!exists) return resError({ ack_msg: "The linked record could not be found — it may have been deleted. Pick it again." });
      }
      finalRelatedRecordId = related_record_id || null;
    }

    const diff = {};
    for (const [key, value] of Object.entries(columns)) {
      if (isSensitiveStored(value) || isSensitiveStored(existing[key])) {
        // Encrypted Aadhaar: a fresh IV makes every encryption differ, so
        // compare the numbers themselves; the audit log only ever gets the
        // masked form, never ciphertext or the full number.
        const before = isSensitiveStored(existing[key]) ? decryptSensitive(existing[key]) : existing[key];
        const after = isSensitiveStored(value) ? decryptSensitive(value) : value;
        if (before == null || String(before) !== String(after)) {
          diff[key] = { from: maskAadhaar(existing[key]), to: maskAadhaar(value) };
        }
        continue;
      }
      if (String(existing[key]) !== String(value)) diff[key] = { from: existing[key], to: value };
    }

    const updateColumns = {
      ...columns,
      related_record_id: finalRelatedRecordId,
      last_edited_by_a_application_login_id: req.body?.a_application_login_id,
      last_edited_date_time: new Date(),
    };
    const setSql = Object.keys(updateColumns).map((k) => `${q(k)} = :${k}`).join(", ");
    await req.tenantDB.query(
      `UPDATE \`${table}\` SET ${setSql} WHERE id = :id`,
      { replacements: { ...updateColumns, id }, type: QueryTypes.UPDATE },
    );
    emitAutomationEvent(req, "form.updated", { table, id, before: [existing], data: updateColumns });

    // Repeaters — full replace, not diffed (plan §4).
    for (const field of fields) {
      if (field.type !== "repeater") continue;
      if (!(field.key in repeaterRowSets)) continue;
      const childTable = repeaterTableName(form.id, field.id);
      await req.tenantDB.query(`DELETE FROM \`${childTable}\` WHERE submission_id = :id`, {
        replacements: { id },
        type: QueryTypes.DELETE,
      });
      let rowOrder = 0;
      for (const row of repeaterRowSets[field.key]) {
        const rowColumns = { submission_id: id, row_order: rowOrder++, ...row };
        const rowKeys = Object.keys(rowColumns);
        await req.tenantDB.query(
          `INSERT INTO \`${childTable}\` (${rowKeys.map((k) => q(k)).join(", ")}) VALUES (${rowKeys.map((k) => `:${k}`).join(", ")})`,
          { replacements: rowColumns, type: QueryTypes.INSERT },
        );
      }
    }

    const fileChanges = await applyFileChanges({
      req,
      form,
      fields,
      id,
      company_masters_id,
      visibleKeys,
      uploadedFiles: req.files,
      writeLocked: combinedLocked,
    });

    // A change to a completed entry (only people with the permission get here) goes in the stage history.
    if (actorCtx.approval.enabled && existing.current_stage && existing.stage_status === "completed") {
      const stage = actorCtx.approval.stages.find((s) => s.id === existing.current_stage);
      if (stage) {
        await logStageEvent({ tenantDB: req.tenantDB, company_masters_id, form_id: form.id, submission_id: id, stage, action: "edit_completed", loginId });
      }
    }

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "update",
      entity_type: ENTITY_TYPE_SUBMISSION,
      entity_id: id,
      details: { changed: diff, ...(fileChanges.removed.length || fileChanges.added.length ? { files: fileChanges } : {}) },
    });

    return resSuccess({ ack_msg: "Submission updated" });
  } catch (e) {
    console.error("updateFormSubmission error:", e);
    // Same friendly message as createFormSubmission for a `unique` field's
    // constraint violation, instead of a generic failure.
    if (e.original?.code === "ER_DUP_ENTRY" || e.parent?.code === "ER_DUP_ENTRY") {
      return resError({
        code: 409,
        ack_msg: "Another entry already has the same value in a field that must be unique. Change it and save again.",
        developer_msg: `Failed to Catch ${e}`,
      });
    }
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteFormSubmission = async (req) => {
  try {
    const { form, access, error } = await loadFormForAccess(req);
    if (error) return error;
    if (!access.canDelete && !access.canFill) return resError({ code: 403, ack_msg: "No delete access" });

    const table = mainTableName(form.id);
    const { id } = req.body || {};
    // Soft delete only (plan §4 "Submission delete: soft, not hard").
    await req.tenantDB.query(`UPDATE \`${table}\` SET isDelete = 1 WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.UPDATE,
    });

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "delete",
      entity_type: ENTITY_TYPE_SUBMISSION,
      entity_id: id,
    });

    return resSuccess({ ack_msg: "Submission deleted" });
  } catch (e) {
    console.error("deleteFormSubmission error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// ---------- Submission status (plan §1 "Submission status") ----------

export const updateSubmissionStatus = async (req) => {
  try {
    const { form, company_masters_id, access, error } = await loadFormForAccess(req);
    if (error) return error;
    if (!access.canFill) return resError({ code: 403, ack_msg: "No access to update this submission's status" });

    const { id, status_id } = req.body || {};
    const StatusModel = stagestatusModel(req.tenantDB);
    const statusRow = await StatusModel.findOne({
      where: { id: status_id, order_type: FORM_SUBMISSIONS_ORDER_TYPE, company_masters_id, isDelete: 0 },
    });
    if (!statusRow) return resError({ ack_msg: "Invalid status for this company" });

    const table = mainTableName(form.id);
    const [existing] = await req.tenantDB.query(
      `SELECT submission_status_id FROM \`${table}\` WHERE id = :id AND isDelete = 0 LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!existing) return resError({ ack_msg: "Submission not found" });

    await req.tenantDB.query(`UPDATE \`${table}\` SET submission_status_id = :status_id WHERE id = :id`, {
      replacements: { status_id, id },
      type: QueryTypes.UPDATE,
    });

    const LogModel = statusAndStagesLogsModel(req.tenantDB);
    await LogModel.create({
      reference_table: "form_builder_submissions",
      reference_id: id,
      information: `Status changed to ${statusRow.name}`,
      status_id,
      previous_status_id: existing.submission_status_id || 0,
      updated_by: req.body?.a_application_login_id,
      updated_date_time: new Date(),
    });
    // This model is written directly here, not through commonServices.js's
    // insertStagesAndStatusLogs (that helper's own emit, C3, doesn't cover it).
    emitAutomationEvent(req, "status.changed", {
      reference_table: "form_builder_submissions",
      table,
      reference_id: id,
      status_id,
      previous_status_id: existing.submission_status_id || 0,
    });

    return resSuccess({ ack_msg: "Status updated" });
  } catch (e) {
    console.error("updateSubmissionStatus error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// ---------- Duplicate Link/Dismiss (plan §4) ----------

export const linkDuplicateContact = async (req) => {
  try {
    const { form, access, error } = await loadFormForAccess(req);
    if (error) return error;
    if (!access.canFill) return resError({ code: 403, ack_msg: "No access" });

    const { id } = req.body || {};
    const table = mainTableName(form.id);
    const [row] = await req.tenantDB.query(
      `SELECT possible_duplicate_contact_id FROM \`${table}\` WHERE id = :id AND isDelete = 0 LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!row?.possible_duplicate_contact_id) return resError({ ack_msg: "No possible match to link" });

    await req.tenantDB.query(
      `UPDATE \`${table}\` SET related_record_id = :cid, possible_duplicate_contact_id = NULL WHERE id = :id`,
      { replacements: { cid: row.possible_duplicate_contact_id, id }, type: QueryTypes.UPDATE },
    );

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "link_duplicate",
      entity_type: ENTITY_TYPE_SUBMISSION,
      entity_id: id,
      details: { contact_id: row.possible_duplicate_contact_id },
    });

    return resSuccess({ ack_msg: "Linked to existing contact" });
  } catch (e) {
    console.error("linkDuplicateContact error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const dismissDuplicateContact = async (req) => {
  try {
    const { form, access, error } = await loadFormForAccess(req);
    if (error) return error;
    if (!access.canFill) return resError({ code: 403, ack_msg: "No access" });

    const { id } = req.body || {};
    const table = mainTableName(form.id);
    await req.tenantDB.query(`UPDATE \`${table}\` SET possible_duplicate_contact_id = NULL WHERE id = :id`, {
      replacements: { id },
      type: QueryTypes.UPDATE,
    });

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "dismiss_duplicate",
      entity_type: ENTITY_TYPE_SUBMISSION,
      entity_id: id,
    });

    return resSuccess({ ack_msg: "Dismissed" });
  } catch (e) {
    console.error("dismissDuplicateContact error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// ---------- Reveal an encrypted Aadhaar value (plan O1) ----------

// Body { form_id, id, field_key } -> { value: "<12 digits>" }. For a
// repeater sub-field, also pass row_id (the child row's id). Needs the
// form's "see_masked_fields" permission (owner always) — see
// canRevealSensitive. Every successful reveal is audit-logged (field key
// only, never the value).
export const revealSensitiveField = async (req) => {
  try {
    const { form, company_masters_id, a_application_login_id, access, error } = await loadFormForAccess(req);
    if (error) return error;
    if (!(await canRevealSensitive({ form, a_application_login_id, company_masters_id, tenantDB: req.tenantDB }))) {
      return resError({ code: 403, ack_msg: "You don't have permission to see the full number" });
    }
    if (access.submissionsScope === "none") return resError({ code: 403, ack_msg: "No access to this submission" });

    const { id, field_key, row_id } = req.body || {};
    const fields = parseSchema(form.published_schema_json);
    const table = mainTableName(form.id);

    let storedValue;
    const topField = fields.find((f) => f.key === field_key && !NO_COLUMN_TYPES.has(f.type));
    if (topField) {
      const [row] = await req.tenantDB.query(
        `SELECT ${q(topField.key)} AS val FROM \`${table}\` WHERE id = :id AND isDelete = 0 LIMIT 1`,
        { replacements: { id }, type: QueryTypes.SELECT },
      );
      if (!row) return resError({ ack_msg: "Submission not found" });
      storedValue = row.val;
    } else {
      const repeater = row_id != null
        ? fields.find((f) => f.type === "repeater" && (f.columns || []).some((c) => c.key === field_key && !NO_COLUMN_TYPES.has(c.type)))
        : null;
      if (!repeater) return resError({ ack_msg: "Field not found on this form" });
      const [parent] = await req.tenantDB.query(
        `SELECT id FROM \`${table}\` WHERE id = :id AND isDelete = 0 LIMIT 1`,
        { replacements: { id }, type: QueryTypes.SELECT },
      );
      if (!parent) return resError({ ack_msg: "Submission not found" });
      const [child] = await req.tenantDB.query(
        `SELECT ${q(field_key)} AS val FROM \`${repeaterTableName(form.id, repeater.id)}\` WHERE id = :row_id AND submission_id = :id LIMIT 1`,
        { replacements: { row_id, id }, type: QueryTypes.SELECT },
      );
      if (!child) return resError({ ack_msg: "Row not found" });
      storedValue = child.val;
    }

    if (!isSensitiveStored(storedValue)) {
      return resError({ ack_msg: "Only the last 4 digits were saved for this entry — there is no full number to show" });
    }
    if (!isSensitiveStorageConfigured()) {
      return resError({ ack_msg: "Secure storage isn't set up on this server, so the full number can't be shown. Ask your administrator." });
    }
    const value = decryptSensitive(storedValue);
    if (value == null) {
      console.error(`revealSensitiveField: decrypt failed for form ${form.id} submission ${id} field ${field_key}`);
      return resError({ ack_msg: "The saved number couldn't be read. Ask your administrator to check the server's secure storage key." });
    }

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "reveal_field",
      entity_type: ENTITY_TYPE_SUBMISSION,
      entity_id: id,
      details: { field_key },
    });

    return resSuccess({ data: { value } });
  } catch (e) {
    console.error("revealSensitiveField error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const getSubmissionAuditLog = async (req) => {
  try {
    const { error } = await loadFormForAccess(req);
    if (error) return error;
    const { id } = req.body || {};
    const rows = await listAuditLog(req, { entity_type: ENTITY_TYPE_SUBMISSION, entity_id: id });
    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("getSubmissionAuditLog error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export { parseSchema, buildValidatedAnswers, enrichSubmissionRows };
