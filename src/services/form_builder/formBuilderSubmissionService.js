import { QueryTypes } from "sequelize";
import companyModel from "../../models/company_setup/companyModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { formBuilderSubmissionFileModel } from "../../models/form_builder/formBuilderSubmissionFileModel.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { statusAndStagesLogsModel } from "../../models/common/statusAndStagesLogsModel.js";
import { isValidFieldKey, mainTableName, repeaterTableName } from "./formBuilderDdlBuilder.js";
import {
  relatedRecordExists,
  resolveMasterLabels,
  resolveRelatedRecordLabels,
} from "./formBuilderMasterRegistry.js";
import { resolveFormAccess } from "./formBuilderRights.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { normalizeToTenDigit } from "../../utils/sharedFunctions.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";
import { logAuditEvent, listAuditLog } from "../company_setup/auditLogServices.js";

const MODULE_KEY = "form_builder";
const ENTITY_TYPE_SUBMISSION = "form_builder_submission";
const FORM_SUBMISSIONS_ORDER_TYPE = 13; // stageAndStatusMasterTableReference["form_builder_submissions"]

const NO_COLUMN_TYPES = new Set(["section-header", "file", "signature", "image", "repeater"]);
const FILE_TYPES = new Set(["file", "signature", "image"]);

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

function validateScalarValue(field, value) {
  if (value == null || value === "") {
    if (field.required) return { error: `${field.label || field.key} is required` };
    return { value: null };
  }

  switch (field.type) {
    case "number":
    case "rating": {
      const num = Number(value);
      if (Number.isNaN(num)) return { error: `${field.label || field.key} must be a number` };
      if (field.min != null && num < field.min) return { error: `${field.label || field.key} is below minimum` };
      if (field.max != null && num > field.max) return { error: `${field.label || field.key} is above maximum` };
      return { value: num };
    }
    case "date":
    case "datetime": {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return { error: `${field.label || field.key} is not a valid date` };
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
      if (!Number.isInteger(num)) return { error: `${field.label || field.key} is invalid` };
      return { value: num };
    }
    case "email": {
      const pattern = field.pattern ? new RegExp(field.pattern) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!pattern.test(String(value))) return { error: `${field.label || field.key} is not a valid email` };
      return { value: String(value) };
    }
    case "url": {
      const pattern = field.pattern ? new RegExp(field.pattern) : /^https?:\/\/.+/i;
      if (!pattern.test(String(value))) return { error: `${field.label || field.key} is not a valid URL` };
      return { value: String(value) };
    }
    case "phone": {
      const pattern = field.pattern ? new RegExp(field.pattern) : /^[0-9+\-\s()]{6,20}$/;
      if (!pattern.test(String(value))) return { error: `${field.label || field.key} is not a valid phone number` };
      return { value: String(value) };
    }
    default: {
      const str = String(value);
      if (field.pattern && !new RegExp(field.pattern).test(str)) {
        return { error: `${field.label || field.key} is invalid` };
      }
      if (field.min != null && str.length < field.min) return { error: `${field.label || field.key} is too short` };
      if (field.max != null && str.length > field.max) return { error: `${field.label || field.key} is too long` };
      return { value: str };
    }
  }
}

// Builds the validated {column: value} map for scalar top-level fields, and
// separately the repeater row sets — server always re-derives this from
// the form's *currently published* schema, never trusts a client-supplied
// field list (plan §4). isPublic drops visible_to:"internal" fields before
// anything else runs.
function buildValidatedAnswers({ fields, answers, isPublic }) {
  const columns = {};
  const errors = [];
  const repeaterRowSets = {}; // field.key -> [{col: val, ...}, ...]

  for (const field of fields) {
    if (isPublic && field.visible_to === "internal") continue; // dropped, not validated, not stored
    if (field.type === "section-header") continue;
    if (FILE_TYPES.has(field.type)) continue; // handled by attachUploadedFiles

    if (field.type === "repeater") {
      const rows = Array.isArray(answers?.[field.key]) ? answers[field.key] : [];
      if (field.required && rows.length === 0) {
        errors.push(`${field.label || field.key} needs at least one row`);
        continue;
      }
      const validatedRows = [];
      for (const row of rows) {
        const rowCols = {};
        for (const subField of field.columns || []) {
          if (FILE_TYPES.has(subField.type)) continue;
          if (NO_COLUMN_TYPES.has(subField.type)) continue;
          const result = validateScalarValue(subField, row?.[subField.key]);
          if (result.error) {
            errors.push(`${field.label || field.key}: ${result.error}`);
          } else {
            rowCols[subField.key] = result.value;
          }
        }
        validatedRows.push(rowCols);
      }
      repeaterRowSets[field.key] = validatedRows;
      continue;
    }

    if (NO_COLUMN_TYPES.has(field.type)) continue;

    const result = validateScalarValue(field, answers?.[field.key]);
    if (result.error) {
      errors.push(result.error);
    } else {
      columns[field.key] = result.value;
    }
  }

  return { columns, errors, repeaterRowSets };
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
}) {
  const fields = parseSchema(form.published_schema_json);
  if (fields.length === 0) {
    throw Object.assign(new Error("This form is not published"), { code: 400 });
  }

  const isPublic = submittedByType === "public";
  const { columns, errors, repeaterRowSets } = buildValidatedAnswers({ fields, answers, isPublic });
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
  const emailMatchField = fields.find((f) => f.match_key === "email");
  const phoneMatchField = fields.find((f) => f.match_key === "phone");
  if (emailMatchField && columns[emailMatchField.key]) resolvedEmail = columns[emailMatchField.key];
  if (phoneMatchField && columns[phoneMatchField.key]) resolvedPhone = columns[phoneMatchField.key];

  // related_record_id: public path never sets it, regardless of what was
  // passed in — server-enforced, not just UI (plan §1/§4 load-bearing rule).
  let finalRelatedRecordId = isPublic ? null : relatedRecordId || null;
  if (finalRelatedRecordId && form.related_module) {
    const exists = await relatedRecordExists({
      tenantDB,
      relatedModule: form.related_module,
      recordId: finalRelatedRecordId,
    });
    if (!exists) {
      throw Object.assign(new Error("related_record_id does not exist"), { code: 400 });
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
    created_date_time: new Date(),
    isDelete: 0,
    isActive: 1,
    ...columns,
  };

  const keys = Object.keys(insertColumns);
  const columnSql = keys.map((k) => q(k)).join(", ");
  const placeholderSql = keys.map((k) => `:${k}`).join(", ");

  let insertId;
  try {
    const [result] = await tenantDB.query(
      `INSERT INTO \`${mainTable}\` (${columnSql}) VALUES (${placeholderSql})`,
      { replacements: insertColumns, type: QueryTypes.INSERT },
    );
    insertId = result;
  } catch (dbError) {
    // Friendly "already submitted" for a `unique` field's constraint
    // violation, not a raw SQL error surfacing to the filler (plan §1).
    if (dbError.original?.code === "ER_DUP_ENTRY" || dbError.parent?.code === "ER_DUP_ENTRY") {
      throw Object.assign(new Error("This has already been submitted"), { code: 409 });
    }
    throw dbError;
  }

  // Repeater rows — one INSERT per row per repeater field.
  for (const field of fields) {
    if (field.type !== "repeater") continue;
    const rows = repeaterRowSets[field.key] || [];
    if (rows.length === 0) continue;
    const childTable = repeaterTableName(form.id, field.id);
    let rowOrder = 0;
    for (const row of rows) {
      const rowColumns = { submission_id: insertId, row_order: rowOrder++, ...row };
      const rowKeys = Object.keys(rowColumns);
      await tenantDB.query(
        `INSERT INTO \`${childTable}\` (${rowKeys.map((k) => q(k)).join(", ")}) VALUES (${rowKeys.map((k) => `:${k}`).join(", ")})`,
        { replacements: rowColumns, type: QueryTypes.INSERT },
      );
    }
  }

  return { submissionId: insertId, possibleDuplicateContactId };
}

// ---------- File attachment (plan §3) ----------

export async function attachUploadedFiles({ tenantDB, company_masters_id, form_id, submission_id, files }) {
  if (!files || files.length === 0) return;
  const FileModel = formBuilderSubmissionFileModel(tenantDB);
  for (const file of files) {
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

    let result;
    try {
      result = await createFormSubmission({
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
      });
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

export const listSubmissions = async (req) => {
  try {
    const { form, company_masters_id, a_application_login_id, access, error } = await loadFormForAccess(req);
    if (error) return error;
    if (access.submissionsScope === "none") return resSuccess({ data: { item: [] } });

    const table = mainTableName(form.id);
    const fields = parseSchema(form.published_schema_json);
    const filterableFields = fields.filter((f) => f.filterable && !NO_COLUMN_TYPES.has(f.type));

    const whereClauses = ["isDelete = 0"];
    const replacements = {};

    if (access.submissionsScope === "own") {
      whereClauses.push("submitted_by_a_application_login_id = :ownLoginId");
      replacements.ownLoginId = a_application_login_id;
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
    }

    if (search) {
      const searchCols = ["submitter_name", "submitter_email", "submitter_phone", ...filterableFields
        .filter((f) => ["text", "textarea", "phone", "email", "url"].includes(f.type))
        .map((f) => f.key)];
      const likeClauses = searchCols.map((col, i) => {
        replacements[`search_${i}`] = `%${search}%`;
        return `${q(col)} LIKE :search_${i}`;
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
    return resSuccess({ data: { item: enriched } });
  } catch (e) {
    console.error("listSubmissions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Resolves reference-field ids, submission_status_id, and related_record_id
// to display labels — batched, never one query per row (plan §1).
async function enrichSubmissionRows({ tenantDB, form, fields, rows }) {
  if (rows.length === 0) return rows;

  const referenceFields = fields.filter((f) => f.type === "reference");
  const labelMaps = {};
  for (const field of referenceFields) {
    const ids = rows.map((r) => r[field.key]).filter((v) => v != null);
    labelMaps[field.key] = await resolveMasterLabels({ tenantDB, master: field.master, ids });
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

  return rows.map((row) => ({
    ...row,
    _reference_labels: Object.fromEntries(
      referenceFields.map((f) => [f.key, row[f.key] != null ? labelMaps[f.key][row[f.key]] : null]),
    ),
    _status: row.submission_status_id != null ? statusMap[row.submission_status_id] : null,
    _related_record_label: row.related_record_id != null ? relatedLabelMap[row.related_record_id] : null,
  }));
}

export const getSubmission = async (req) => {
  try {
    const { form, access, error } = await loadFormForAccess(req);
    if (error) return error;
    if (access.submissionsScope === "none") return resError({ code: 403, ack_msg: "No access to this submission" });

    const table = mainTableName(form.id);
    const { id } = req.body || {};
    const [row] = await req.tenantDB.query(
      `SELECT * FROM \`${table}\` WHERE id = :id AND isDelete = 0 LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!row) return resError({ ack_msg: "Submission not found" });

    if (access.submissionsScope === "own" && String(row.submitted_by_a_application_login_id) !== String(req.body?.a_application_login_id)) {
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
    return resSuccess({ data: { item: { ...enriched, _repeaters: repeaterRows } } });
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
    if (!access.canFill) return resError({ code: 403, ack_msg: "No edit access to this form's submissions" });

    const table = mainTableName(form.id);
    const { id, answers, related_record_id, expected_last_edited_date_time } = req.body || {};

    const [existing] = await req.tenantDB.query(
      `SELECT * FROM \`${table}\` WHERE id = :id AND isDelete = 0 LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!existing) return resError({ ack_msg: "Submission not found" });

    // Concurrent-edit guard — reuses last_edited_date_time (plan §4).
    const existingStamp = existing.last_edited_date_time ? new Date(existing.last_edited_date_time).getTime() : null;
    const expectedStamp = expected_last_edited_date_time ? new Date(expected_last_edited_date_time).getTime() : null;
    if (existingStamp && expectedStamp && existingStamp !== expectedStamp) {
      return resError({ code: 409, ack_msg: "This submission was edited by someone else — reload and try again" });
    }

    const fields = parseSchema(form.published_schema_json);
    const { columns, errors, repeaterRowSets } = buildValidatedAnswers({ fields, answers, isPublic: false });
    if (errors.length > 0) return resError({ ack_msg: errors.join("; ") });

    let finalRelatedRecordId = existing.related_record_id;
    if (related_record_id !== undefined) {
      if (related_record_id && form.related_module) {
        const exists = await relatedRecordExists({ tenantDB: req.tenantDB, relatedModule: form.related_module, recordId: related_record_id });
        if (!exists) return resError({ ack_msg: "related_record_id does not exist" });
      }
      finalRelatedRecordId = related_record_id || null;
    }

    const diff = {};
    for (const [key, value] of Object.entries(columns)) {
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

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "update",
      entity_type: ENTITY_TYPE_SUBMISSION,
      entity_id: id,
      details: { changed: diff },
    });

    return resSuccess({ ack_msg: "Submission updated" });
  } catch (e) {
    console.error("updateFormSubmission error:", e);
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
