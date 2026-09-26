import crypto from "crypto";
import { QueryTypes } from "sequelize";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { formBuilderFormTeamRightModel } from "../../models/form_builder/formBuilderFormTeamRightModel.js";
import {
  resolveFormBuilderRights,
  resolveFormAccess,
  getFormTeamRights,
  setFormTeamRights,
} from "./formBuilderRights.js";
import {
  buildCreateMainTableStatement,
  buildCreateRepeaterTableStatement,
  buildAlterAddColumnsStatement,
  buildAlterModifyColumnsStatement,
  mainTableName,
  repeaterTableName,
  NO_COLUMN_TYPES,
  LAYOUT_TYPES,
} from "./formBuilderDdlBuilder.js";
import { getReferenceOptions } from "./formBuilderMasterRegistry.js";
import { sensitiveStoragePublishMessage } from "./formBuilderSensitiveValue.js";
import { findConditionProblems } from "./formBuilderConditions.js";
import { findDateRuleProblems } from "./formBuilderDateRules.js";
import { findLookupProblems } from "./formBuilderLookups.js";
import { getExistingCustomListIds } from "./formBuilderCustomLists.js";
import { validateAutoNumberConfig, previewAutoNumber } from "./formBuilderAutoNumber.js";
import { findCalculationProblems } from "./formBuilderCalculations.js";
import { findQuestionTableProblems } from "./formBuilderQuestionTable.js";
import { computeRestrictions, findRestrictionProblems } from "./formBuilderFieldRestrictions.js";
import { approvalOf, findApprovalProblems } from "./formBuilderApproval.js";
import { findConsentProblems, findPublicSettingsProblems } from "./formBuilderPublicSettings.js";
import { findProductLookupProblems } from "./formBuilderProductLookup.js";
import { countPendingForMe, ensureStageColumns, loadActorContext } from "./formBuilderApprovalService.js";
import { resolveTemplateForCreate } from "./formBuilderTemplates.js";
import { normalizePermissionChanges } from "./formBuilderPermissionKeys.js";
import {
  getMyFormPermissions,
  listFormPermissions as listFormPermissionRows,
  saveFormPermissions as saveFormPermissionRows,
  listPermissionOptions,
} from "./formBuilderPermissions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";
import { logAuditEvent, listAuditLog } from "../company_setup/auditLogServices.js";

const MODULE_KEY = "form_builder";
const ENTITY_TYPE_FORM = "form_builder_form";

// Public share links are built as /f/:qrCode/:shareToken (plan §2) — the
// list/get views need the company's own qr_code to render a copyable link,
// same value onlineStoreService.js's own public link already uses.
async function getCompanyQrCode(company_masters_id) {
  const row = await companyModel.findOne({ where: { id: company_masters_id, isDelete: 0 }, attributes: ["qr_code"] });
  return row?.qr_code || null;
}

function parseSchema(json) {
  if (!json) return [];
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function repeaterFieldsOf(fields) {
  return fields.filter((f) => f.type === "repeater");
}

async function loadOwnedForm(req, { requireEdit = false } = {}) {
  // /form-builder/:id/... routes carry the id in the URL, the rest in the body.
  const id = req.body?.id ?? req.params?.id;
  const a_application_login_id = req.body?.a_application_login_id;
  const company = await getCompanyByLoginId(a_application_login_id);
  if (!company) {
    return { error: resError({ ack_msg: "Company not found for login ID" }) };
  }
  const company_masters_id = company.company_masters_id;

  const FormModel = formBuilderFormModel(req.tenantDB);
  const form = await FormModel.findOne({
    where: { id, company_masters_id, isDelete: 0 },
  });
  if (!form) {
    return { error: resError({ ack_msg: "Form not found" }) };
  }

  const rights = await resolveFormBuilderRights({
    company_masters_id,
    a_application_login_id,
    tenantDB: req.tenantDB,
  });
  const isCreator = String(form.a_application_login_id) === String(a_application_login_id);
  const canView = rights.isOwner || rights.showAllData || (rights.showPersonalData && isCreator);
  const canEdit = rights.isOwner || (rights.showAllData && rights.canEdit) || (rights.showPersonalData && isCreator && rights.canEdit);

  if (requireEdit && !canEdit) {
    return { error: resError({ code: 403, ack_msg: "You don't have permission to edit this form" }) };
  }
  if (!requireEdit && !canView) {
    return { error: resError({ code: 403, ack_msg: "You don't have permission to open this form" }) };
  }

  return { form, company_masters_id, a_application_login_id, rights, isCreator };
}

// ---------- Forms CRUD ----------

export const listForms = async (req) => {
  try {
    const a_application_login_id = req.body?.a_application_login_id;
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company) return resError({ ack_msg: "Company not found for login ID" });
    const company_masters_id = company.company_masters_id;

    const rights = await resolveFormBuilderRights({ company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
    if (!(rights.isOwner || rights.showAllData || rights.showPersonalData)) {
      return resSuccess({ data: { item: [] } });
    }

    const FormModel = formBuilderFormModel(req.tenantDB);
    const where = { company_masters_id, isDelete: 0 };
    if (!rights.isOwner && !rights.showAllData) {
      where.a_application_login_id = a_application_login_id;
    }

    const rows = await FormModel.findAll({
      where,
      order: [["display_order", "ASC"], ["id", "DESC"]],
      raw: true,
    });
    const company_qr_code = await getCompanyQrCode(company_masters_id);
    return resSuccess({ data: { item: rows.map((r) => ({ ...r, company_qr_code })) } });
  } catch (e) {
    console.error("listForms error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const getForm = async (req) => {
  try {
    const { form, company_masters_id, a_application_login_id, error } = await loadOwnedForm(req);
    if (error) return error;
    const company_qr_code = await getCompanyQrCode(company_masters_id);
    // This user's per-form permissions (section 3) — the fill screen locks
    // "permission" date fields when can_change_dates is false.
    const my_form_permissions = await getMyFormPermissions({
      form,
      loginId: a_application_login_id,
      company_masters_id,
      tenantDB: req.tenantDB,
    });
    return resSuccess({
      data: {
        item: {
          ...form.toJSON(),
          company_qr_code,
          can_change_dates: my_form_permissions.change_dates,
          my_form_permissions,
          // Fields this user may not fully see or change (plan O8) — the fill screen hides / locks them.
          restricted: computeRestrictions(parseSchema(form.published_schema_json), my_form_permissions.see_masked_fields),
        },
      },
    });
  } catch (e) {
    console.error("getForm error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const createForm = async (req) => {
  try {
    const a_application_login_id = req.body?.a_application_login_id;
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company) return resError({ ack_msg: "Company not found for login ID" });
    const company_masters_id = company.company_masters_id;

    const rights = await resolveFormBuilderRights({ company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
    if (!(rights.isOwner || rights.canAdd)) {
      return resError({ code: 403, ack_msg: "You don't have permission to create forms" });
    }

    const { title, description, related_module, template } = req.body || {};
    if (!title) return resError({ ack_msg: "Please enter a form title" });

    // Starting from a starter form or a saved template (plan L1): its fields (and
    // form settings) become this form's first draft.
    const fromTemplate = await resolveTemplateForCreate({ tenantDB: req.tenantDB, company_masters_id, template });
    if (fromTemplate?.error) return resError({ ack_msg: fromTemplate.error });

    const FormModel = formBuilderFormModel(req.tenantDB);
    const created = await FormModel.create({
      company_masters_id,
      a_application_login_id,
      title,
      description: description || fromTemplate?.description || null,
      schema_json: fromTemplate?.schema_json || JSON.stringify([]),
      settings_json: fromTemplate?.settings_json || null,
      related_module: related_module || null,
      version: 1,
    });

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "create",
      entity_type: ENTITY_TYPE_FORM,
      entity_id: created.id,
      details: { title },
    });

    return resSuccess({ ack_msg: "Form created", data: { item: created } });
  } catch (e) {
    console.error("createForm error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const updateDraftForm = async (req) => {
  try {
    const { form, error } = await loadOwnedForm(req, { requireEdit: true });
    if (error) return error;

    const { title, description, related_module, restrict_to_assigned_team, schema_json, settings } = req.body || {};
    const changed = {};
    if (title !== undefined) changed.title = title;
    if (description !== undefined) changed.description = description;
    if (related_module !== undefined) changed.related_module = related_module;
    if (restrict_to_assigned_team !== undefined) changed.restrict_to_assigned_team = restrict_to_assigned_team;
    if (schema_json !== undefined) {
      changed.schema_json = typeof schema_json === "string" ? schema_json : JSON.stringify(schema_json);
      changed.has_unpublished_changes = form.published_schema_json != null ? 1 : form.has_unpublished_changes;
    }

    // Form-level settings (approval stages, ...): saved with the draft, published together with the fields.
    if (settings !== undefined) {
      changed.settings_json = settings === null ? null : typeof settings === "string" ? settings : JSON.stringify(settings);
      changed.has_unpublished_changes = form.published_schema_json != null ? 1 : form.has_unpublished_changes;
    }

    await form.update(changed);

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "update",
      entity_type: ENTITY_TYPE_FORM,
      entity_id: form.id,
      details: { changed: Object.keys(changed) },
    });

    return resSuccess({ ack_msg: "Draft updated", data: { item: form } });
  } catch (e) {
    console.error("updateDraftForm error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const discardDraftForm = async (req) => {
  try {
    const { form, error } = await loadOwnedForm(req, { requireEdit: true });
    if (error) return error;

    if (form.published_schema_json != null) {
      await form.update({ schema_json: form.published_schema_json, settings_json: form.published_settings_json, has_unpublished_changes: 0 });
    } else {
      await form.update({ schema_json: JSON.stringify([]), settings_json: null, has_unpublished_changes: 0 });
    }

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "discard_draft",
      entity_type: ENTITY_TYPE_FORM,
      entity_id: form.id,
    });

    return resSuccess({ ack_msg: "Draft discarded", data: { item: form } });
  } catch (e) {
    console.error("discardDraftForm error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteForm = async (req) => {
  try {
    const { form, error } = await loadOwnedForm(req, { requireEdit: true });
    if (error) return error;

    // Soft delete only — plan §1 "Delete policy": the fbs_<id> table and
    // its data are kept forever in v1, no DROP TABLE.
    await form.update({ isDelete: 1 });

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "delete",
      entity_type: ENTITY_TYPE_FORM,
      entity_id: form.id,
    });

    return resSuccess({ ack_msg: "Form deleted" });
  } catch (e) {
    console.error("deleteForm error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const duplicateForm = async (req) => {
  try {
    const { form, company_masters_id, error } = await loadOwnedForm(req);
    if (error) return error;
    const a_application_login_id = req.body?.a_application_login_id;

    const FormModel = formBuilderFormModel(req.tenantDB);
    const created = await FormModel.create({
      company_masters_id,
      a_application_login_id,
      title: `${form.title} (Copy)`,
      description: form.description,
      schema_json: form.schema_json,
      settings_json: form.settings_json,
      related_module: form.related_module,
      restrict_to_assigned_team: form.restrict_to_assigned_team,
      published_schema_json: null,
      submission_table_name: null,
      share_token: null,
      allow_public_submission: 0,
      has_unpublished_changes: 0,
      version: 1,
    });

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "duplicate",
      entity_type: ENTITY_TYPE_FORM,
      entity_id: created.id,
      details: { source_id: form.id, title: created.title },
    });

    return resSuccess({ ack_msg: "Form duplicated", data: { item: created } });
  } catch (e) {
    console.error("duplicateForm error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const togglePublicLink = async (req) => {
  try {
    const { form, error } = await loadOwnedForm(req, { requireEdit: true });
    if (error) return error;

    const { allow_public_submission } = req.body || {};
    const enabling = !!allow_public_submission;

    const changed = { allow_public_submission: enabling ? 1 : 0 };
    if (enabling && !form.share_token) {
      changed.share_token = crypto.randomBytes(32).toString("hex");
    }
    await form.update(changed);

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "toggle_public_link",
      entity_type: ENTITY_TYPE_FORM,
      entity_id: form.id,
      details: { allow_public_submission: changed.allow_public_submission },
    });

    return resSuccess({ ack_msg: "Public link updated", data: { item: form } });
  } catch (e) {
    console.error("togglePublicLink error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const regenerateShareToken = async (req) => {
  try {
    const { form, error } = await loadOwnedForm(req, { requireEdit: true });
    if (error) return error;

    const share_token = crypto.randomBytes(32).toString("hex");
    await form.update({ share_token });

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "regenerate_share_token",
      entity_type: ENTITY_TYPE_FORM,
      entity_id: form.id,
    });

    return resSuccess({ ack_msg: "Share link regenerated", data: { item: form } });
  } catch (e) {
    console.error("regenerateShareToken error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// ---------- Publish (the DDL orchestration — plan §1 "Publish failure /
// DDL recovery") ----------

async function tableExists(tenantDB, tableName) {
  const dbName = tenantDB.config.database;
  const rows = await tenantDB.query(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = :dbName AND table_name = :tableName LIMIT 1",
    { replacements: { dbName, tableName }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}

async function existingColumns(tenantDB, tableName) {
  const dbName = tenantDB.config.database;
  const rows = await tenantDB.query(
    "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = :dbName AND table_name = :tableName",
    { replacements: { dbName, tableName }, type: QueryTypes.SELECT },
  );
  return new Set(rows.map((r) => r.COLUMN_NAME));
}

async function rowCount(tenantDB, tableName) {
  const [row] = await tenantDB.query(`SELECT COUNT(*) AS cnt FROM \`${tableName}\``, {
    type: QueryTypes.SELECT,
  });
  return Number(row?.cnt || 0);
}

// “Label” / “Label” (in “Repeater”) — how a field is named in messages
// shown to the form builder (never the raw key or table name).
function quotedFieldLabel(field, parentLabel) {
  const own = `“${field.label || field.key}”`;
  return parentLabel ? `${own} (in “${parentLabel}”)` : own;
}

// Two data fields sharing one internal name (key) in the same table would
// make the CREATE/ALTER fail with a generic error — caught before any DDL
// runs, with the clashing labels named. Layout-only fields (section-header,
// instruction) never become columns, so they are left out of the check.
function duplicateKeyMessage(fields, parentLabel) {
  const byKey = new Map();
  for (const field of fields) {
    if (LAYOUT_TYPES.has(field.type) || !field.key) continue;
    if (!byKey.has(field.key)) byKey.set(field.key, []);
    byKey.get(field.key).push(field);
  }
  for (const group of byKey.values()) {
    if (group.length > 1) {
      const labels = group.map((f) => quotedFieldLabel(f, parentLabel)).join(" and ");
      return `${labels} have the same internal name. Open "Advanced" on one of them and change it, or rename the field.`;
    }
  }
  for (const field of fields) {
    if (field.type !== "repeater") continue;
    const nested = duplicateKeyMessage(field.columns || [], field.label || field.key);
    if (nested) return nested;
  }
  return null;
}

// Idempotent create-or-diff-alter for one table (main or repeater child) —
// same code path whether this is a genuine first publish, a normal
// republish, or a retry resuming a previously-failed publish (plan §1).
// parentLabel: the repeater's label when tableName is a repeater child
// table, used only for user-facing messages.
async function ensureTableMatchesFields(tenantDB, tableName, fields, previousFieldsByKey, createStatementFn, parentLabel = null) {
  const exists = await tableExists(tenantDB, tableName);
  if (!exists) {
    await tenantDB.query(createStatementFn());
    return;
  }

  const existingCols = await existingColumns(tenantDB, tableName);
  const newFields = [];
  const typeChangedFields = [];

  for (const field of fields) {
    if (NO_COLUMN_TYPES.has(field.type)) continue;
    if (!existingCols.has(field.key)) {
      newFields.push(field);
      continue;
    }
    const previous = previousFieldsByKey.get(field.key);
    // A calculation switching between a number and a date result changes its column too.
    const resultChanged = field.type === "calculation" && previous && (previous.result_type === "date") !== (field.result_type === "date");
    if (previous && (previous.type !== field.type || resultChanged)) {
      typeChangedFields.push(field);
    }
  }

  if (typeChangedFields.length > 0) {
    const count = await rowCount(tenantDB, tableName);
    if (count > 0) {
      // Developer detail (keys/table/count) to the log only; the builder
      // sees field labels.
      console.error(
        `publishForm: type change blocked for [${typeChangedFields.map((f) => f.key).join(", ")}] — ${tableName} has ${count} row(s)`,
      );
      const labels = typeChangedFields.map((f) => quotedFieldLabel(f, parentLabel)).join(", ");
      const plural = typeChangedFields.length > 1;
      throw new Error(
        `VALIDATION: ${labels} already ${plural ? "have" : "has"} saved entries, so ${plural ? "their type" : "its type"} can't be changed. Add a new field instead.`,
      );
    }
    const modifyStatement = buildAlterModifyColumnsStatement(tableName, typeChangedFields);
    if (modifyStatement) await tenantDB.query(modifyStatement);
  }

  if (newFields.length > 0) {
    const alterStatement = buildAlterAddColumnsStatement(tableName, newFields);
    if (alterStatement) await tenantDB.query(alterStatement);
  }
}

export const publishForm = async (req) => {
  try {
    const { form, company_masters_id, error } = await loadOwnedForm(req, { requireEdit: true });
    if (error) return error;

    const { expected_version } = req.body || {};
    if (expected_version != null && Number(expected_version) !== Number(form.version)) {
      return resError({
        code: 409,
        ack_msg: "Someone else changed this form after you opened it. Reload the page to get the latest version, then publish again.",
      });
    }

    const draftFields = parseSchema(form.schema_json);
    const duplicateMessage = duplicateKeyMessage(draftFields);
    if (duplicateMessage) return resError({ ack_msg: duplicateMessage });
    // Aadhaar "keep full number" fields: needs the server's encryption key,
    // and can't be combined with unique (formBuilderSensitiveValue.js).
    const sensitiveMessage = sensitiveStoragePublishMessage(draftFields);
    if (sensitiveMessage) return resError({ ack_msg: sensitiveMessage });
    // "Show only when" / "Required only when" rules: no rule on a deleted
    // field, no circular chain (D7). Date edit rules readable (C2).
    const conditionMessage = findConditionProblems(draftFields);
    if (conditionMessage) return resError({ ack_msg: conditionMessage });
    const dateRuleMessage = findDateRuleProblems(draftFields);
    if (dateRuleMessage) return resError({ ack_msg: dateRuleMessage });
    // Lookup fields (plan E, F): custom lists still exist, customer-lookup
    // "fill these fields" settings point at real text fields.
    const lookupMessage = findLookupProblems(draftFields, {
      existingCustomListIds: await getExistingCustomListIds(req.tenantDB, company_masters_id),
    });
    if (lookupMessage) return resError({ ack_msg: lookupMessage });
    // Restricted fields (plan O8): valid mode, not on headings.
    const restrictionMessage = findRestrictionProblems(draftFields);
    if (restrictionMessage) return resError({ ack_msg: restrictionMessage });
    // Approval stages (plan I): stages named, people chosen, fields and signatures point at real stages.
    const approvalMessage = findApprovalProblems(form.settings_json, draftFields);
    if (approvalMessage) return resError({ ack_msg: approvalMessage });
    // Public form controls (plan M2, M3): open/close dates make sense, a
    // consent field has its terms text.
    const publicSettingsMessage = findPublicSettingsProblems(form.settings_json);
    if (publicSettingsMessage) return resError({ ack_msg: publicSettingsMessage });
    const consentMessage = findConsentProblems(draftFields);
    if (consentMessage) return resError({ ack_msg: consentMessage });
    // Product line auto-fill (plan N5): mapped columns point at real, compatible siblings.
    const productLookupMessage = findProductLookupProblems(draftFields);
    if (productLookupMessage) return resError({ ack_msg: productLookupMessage });
    // Question tables (plan G) and calculations (plan H): questions / columns
    // make sense, formulas parse and only use fields that exist.
    for (const field of draftFields) {
      if (field.type !== "question-table") continue;
      const tableMessage = findQuestionTableProblems(field);
      if (tableMessage) return resError({ ack_msg: tableMessage });
    }
    const calculationMessage = findCalculationProblems(draftFields);
    if (calculationMessage) return resError({ ack_msg: calculationMessage });
    // Auto-number fields (plan B): format has {SEQ}, reset rule matches the
    // format, series / date field exist, fits the column. Auto numbers only
    // live on the main table, never on a repeater row.
    for (const field of draftFields) {
      if (field.type !== "auto-number") continue;
      const autoNumberMessage = validateAutoNumberConfig(field, draftFields);
      if (autoNumberMessage) return resError({ ack_msg: autoNumberMessage });
    }
    for (const repeater of repeaterFieldsOf(draftFields)) {
      if ((repeater.columns || []).some((c) => c.type === "auto-number")) {
        return resError({ ack_msg: `“${repeater.label || repeater.key}”: an Auto Number can't be a column inside a repeating table. Put it on the main form instead.` });
      }
    }
    const previousFields = parseSchema(form.published_schema_json);
    const previousFieldsByKey = new Map(previousFields.map((f) => [f.key, f]));

    const mainTable = mainTableName(form.id);
    const repeaters = repeaterFieldsOf(draftFields);

    try {
      // Main table first, then each repeater in schema order — deterministic
      // (plan §1's "Ordering" note), matters for reasoning about a partial
      // failure.
      await ensureTableMatchesFields(req.tenantDB, mainTable, draftFields, previousFieldsByKey, () =>
        buildCreateMainTableStatement(form.id, draftFields),
      );

      for (const repeater of repeaters) {
        const childTable = repeaterTableName(form.id, repeater.id);
        const previousRepeater = previousFieldsByKey.get(repeater.key);
        const previousSubFieldsByKey = new Map(
          (previousRepeater?.columns || []).map((f) => [f.key, f]),
        );
        await ensureTableMatchesFields(
          req.tenantDB,
          childTable,
          repeater.columns || [],
          previousSubFieldsByKey,
          () => buildCreateRepeaterTableStatement(form.id, repeater.id, repeater.columns || []),
          repeater.label || repeater.key,
        );
      }
      // A form published before approval / drafts / consent / lead-source
      // existed still gets those columns on its next publish.
      await ensureStageColumns(req.tenantDB, mainTable);
    } catch (ddlError) {
      // Do NOT touch published_schema_json/version/has_unpublished_changes —
      // the form stays visibly "unpublished changes pending," matching its
      // actual state. A retry (just clicking Publish again) resumes via the
      // same idempotent path above. Plan §1 "Publish failure / DDL recovery".
      console.error("publishForm DDL error:", ddlError);
      await logAuditEvent(req, {
        module_key: MODULE_KEY,
        action: "publish_failed",
        entity_type: ENTITY_TYPE_FORM,
        entity_id: form.id,
        details: { error: String(ddlError.message || ddlError) },
      });
      const isValidation = String(ddlError.message || "").startsWith("VALIDATION:");
      return resError({
        code: isValidation ? 400 : 500,
        ack_msg: isValidation
          ? ddlError.message.replace("VALIDATION: ", "")
          : "The form could not be published. Please try again — if it keeps failing, contact support.",
      });
    }

    const newSubmissionTableName = mainTable;
    await form.update({
      published_schema_json: form.schema_json,
      published_settings_json: form.settings_json,
      submission_table_name: newSubmissionTableName,
      has_unpublished_changes: 0,
      version: (form.version || 1) + 1,
    });

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "publish",
      entity_type: ENTITY_TYPE_FORM,
      entity_id: form.id,
      details: { version: form.version, field_count: draftFields.length },
    });

    return resSuccess({ ack_msg: "Form published", data: { item: form } });
  } catch (e) {
    console.error("publishForm error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// ---------- Tier 2 team-rights management (plan §2) ----------

export const listFormTeamRights = async (req) => {
  try {
    const { form, company_masters_id, error } = await loadOwnedForm(req, { requireEdit: true });
    if (error) return error;

    const rows = await getFormTeamRights({ form_id: form.id, company_masters_id, tenantDB: req.tenantDB });
    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("listFormTeamRights error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const saveFormTeamRights = async (req) => {
  try {
    const { form, company_masters_id, error } = await loadOwnedForm(req, { requireEdit: true });
    if (error) return error;

    const { grants, removals } = req.body || {};
    await setFormTeamRights(
      { form_id: form.id, company_masters_id, grants: Array.isArray(grants) ? grants : [], removals: Array.isArray(removals) ? removals : [] },
      req.tenantDB,
    );

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "update_team_rights",
      entity_type: ENTITY_TYPE_FORM,
      entity_id: form.id,
      details: { grants, removals },
    });

    return resSuccess({ ack_msg: "Access updated successfully" });
  } catch (e) {
    console.error("saveFormTeamRights error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// ---------- Per-form permissions ("Permissions" tab, plan section 3/7) ----------

// POST /form-builder/:id/permissions/list -> { items: [{ permission_key,
// a_application_login_id, team_id, name }] }. Build/edit access required.
export const listFormPermissions = async (req) => {
  try {
    const { form, company_masters_id, error } = await loadOwnedForm(req, { requireEdit: true });
    if (error) return error;
    const items = await listFormPermissionRows({ form_id: form.id, company_masters_id, tenantDB: req.tenantDB });
    return resSuccess({ data: { items } });
  } catch (e) {
    console.error("listFormPermissions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// POST /form-builder/:id/permissions/save with { grants: [...], removals:
// [...] }, each entry { permission_key, a_application_login_id } or
// { permission_key, team_id }. Returns the saved list, same shape as /list.
export const saveFormPermissions = async (req) => {
  try {
    const { form, company_masters_id, error } = await loadOwnedForm(req, { requireEdit: true });
    if (error) return error;

    const changes = normalizePermissionChanges(req.body || {});
    if (changes.error) return resError({ ack_msg: changes.error });

    const saved = await saveFormPermissionRows({
      form_id: form.id,
      company_masters_id,
      grants: changes.grants,
      removals: changes.removals,
      tenantDB: req.tenantDB,
    });
    if (saved.error) return resError({ ack_msg: saved.error });

    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "update_permissions",
      entity_type: ENTITY_TYPE_FORM,
      entity_id: form.id,
      details: { grants: changes.grants, removals: changes.removals },
    });

    const items = await listFormPermissionRows({ form_id: form.id, company_masters_id, tenantDB: req.tenantDB });
    return resSuccess({ ack_msg: "Permissions updated successfully", data: { items } });
  } catch (e) {
    console.error("saveFormPermissions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// POST /form-builder/permission-options -> { users: [{ a_application_login_id,
// name, team_id }], teams: [{ team_id, name }] } for the Permissions tab
// picker. Anyone who may build or edit forms.
export const getFormPermissionOptions = async (req) => {
  try {
    const a_application_login_id = req.body?.a_application_login_id;
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company) return resError({ ack_msg: "Company not found for login ID" });
    const company_masters_id = company.company_masters_id;

    const rights = await resolveFormBuilderRights({ company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
    if (!(rights.isOwner || rights.canAdd || rights.canEdit)) {
      return resError({ code: 403, ack_msg: "You don't have permission to manage form permissions" });
    }

    const options = await listPermissionOptions({ company_masters_id, tenantDB: req.tenantDB });
    return resSuccess({ data: options });
  } catch (e) {
    console.error("getFormPermissionOptions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const getFormAuditLog = async (req) => {
  try {
    const { form, error } = await loadOwnedForm(req);
    if (error) return error;
    const rows = await listAuditLog(req, { entity_type: ENTITY_TYPE_FORM, entity_id: form.id });
    return resSuccess({ data: { item: rows } });
  } catch (e) {
    console.error("getFormAuditLog error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const getInternalReferenceOptions = async (req) => {
  try {
    const { master, parentId } = req.body || {};
    const company = await getCompanyByLoginId(req.body?.a_application_login_id);
    const options = await getReferenceOptions({
      tenantDB: req.tenantDB,
      master,
      parentId,
      company_masters_id: company?.company_masters_id,
    });
    return resSuccess({ data: { item: options } });
  } catch (e) {
    console.error("getInternalReferenceOptions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// ---------- Staff-facing "Published Forms" list (SideView ?view=forms,
// plan §7) — Tier 1 + Tier 2 combined, published forms only ----------

export const listPublishedFormsForFilling = async (req) => {
  try {
    const a_application_login_id = req.body?.a_application_login_id;
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company) return resError({ ack_msg: "Company not found for login ID" });
    const company_masters_id = company.company_masters_id;

    const FormModel = formBuilderFormModel(req.tenantDB);
    const candidates = await FormModel.findAll({
      where: { company_masters_id, isDelete: 0 },
      order: [["display_order", "ASC"]],
    });

    const visible = [];
    for (const form of candidates) {
      if (!form.published_schema_json) continue;
      if (!form.restrict_to_assigned_team) {
        visible.push(form);
        continue;
      }
      const access = await resolveFormAccess({ form, company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
      if (access.canFill) {
        visible.push(form);
        continue;
      }
      // A person who works on one of the form's approval stages sees it too.
      const actor = await loadActorContext({ form, loginId: a_application_login_id, company_masters_id });
      if (actor.approval.enabled && (actor.owner || actor.myStageIds.length > 0)) visible.push(form);
    }

    // can_change_dates per form (date edit rule "permission", plan C2).
    const items = [];
    for (const form of visible) {
      const perms = await getMyFormPermissions({ form, loginId: a_application_login_id, company_masters_id, tenantDB: req.tenantDB });
      // How many entries wait for this person at their approval stage.
      const actor = await loadActorContext({ form, loginId: a_application_login_id, company_masters_id });
      const my_pending_count = actor.approval.enabled ? await countPendingForMe({ tenantDB: req.tenantDB, form, ctx: actor }) : 0;
      items.push({ ...form.toJSON(), can_change_dates: perms.change_dates, my_pending_count });
    }

    return resSuccess({ data: { item: items } });
  } catch (e) {
    console.error("listPublishedFormsForFilling error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// Live example for the editor's Auto Number settings ("Next number will look
// like ..."). Pure — no DB read; the real number is only taken on save.
export const previewAutoNumberFormat = async (req) => {
  try {
    const { auto_number, fields, key, series_value } = req.body || {};
    const field = { key: key || "auto_number", label: "Auto Number", type: "auto-number", auto_number };
    const problem = validateAutoNumberConfig(field, Array.isArray(fields) ? fields : []);
    if (problem) return resError({ ack_msg: problem });
    const example = previewAutoNumber(auto_number, { seriesKey: series_value ? String(series_value) : "" });
    return resSuccess({ data: { example } });
  } catch (e) {
    console.error("previewAutoNumberFormat error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
