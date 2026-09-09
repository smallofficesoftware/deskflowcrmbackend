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
} from "./formBuilderDdlBuilder.js";
import { getReferenceOptions } from "./formBuilderMasterRegistry.js";
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
  const { id } = req.body || {};
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
    return { error: resError({ code: 403, ack_msg: "You do not have edit access to this form" }) };
  }
  if (!requireEdit && !canView) {
    return { error: resError({ code: 403, ack_msg: "You do not have access to this form" }) };
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
    const { form, company_masters_id, error } = await loadOwnedForm(req);
    if (error) return error;
    const company_qr_code = await getCompanyQrCode(company_masters_id);
    return resSuccess({ data: { item: { ...form.toJSON(), company_qr_code } } });
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
      return resError({ code: 403, ack_msg: "You do not have create access in Form Builder" });
    }

    const { title, description, related_module } = req.body || {};
    if (!title) return resError({ ack_msg: "title is required" });

    const FormModel = formBuilderFormModel(req.tenantDB);
    const created = await FormModel.create({
      company_masters_id,
      a_application_login_id,
      title,
      description: description || null,
      schema_json: JSON.stringify([]),
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

    const { title, description, related_module, restrict_to_assigned_team, schema_json } = req.body || {};
    const changed = {};
    if (title !== undefined) changed.title = title;
    if (description !== undefined) changed.description = description;
    if (related_module !== undefined) changed.related_module = related_module;
    if (restrict_to_assigned_team !== undefined) changed.restrict_to_assigned_team = restrict_to_assigned_team;
    if (schema_json !== undefined) {
      changed.schema_json = typeof schema_json === "string" ? schema_json : JSON.stringify(schema_json);
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
      await form.update({ schema_json: form.published_schema_json, has_unpublished_changes: 0 });
    } else {
      await form.update({ schema_json: JSON.stringify([]), has_unpublished_changes: 0 });
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

// Idempotent create-or-diff-alter for one table (main or repeater child) —
// same code path whether this is a genuine first publish, a normal
// republish, or a retry resuming a previously-failed publish (plan §1).
async function ensureTableMatchesFields(tenantDB, tableName, fields, previousFieldsByKey, createStatementFn) {
  const exists = await tableExists(tenantDB, tableName);
  if (!exists) {
    await tenantDB.query(createStatementFn());
    return;
  }

  const existingCols = await existingColumns(tenantDB, tableName);
  const newFields = [];
  const typeChangedFields = [];

  for (const field of fields) {
    if (["section-header", "file", "signature", "image", "repeater"].includes(field.type)) continue;
    if (!existingCols.has(field.key)) {
      newFields.push(field);
      continue;
    }
    const previous = previousFieldsByKey.get(field.key);
    if (previous && previous.type !== field.type) {
      typeChangedFields.push(field);
    }
  }

  if (typeChangedFields.length > 0) {
    const count = await rowCount(tenantDB, tableName);
    if (count > 0) {
      const keys = typeChangedFields.map((f) => f.key).join(", ");
      throw new Error(
        `VALIDATION: cannot change type of field(s) [${keys}] — ${tableName} already has ${count} submission(s). Add a new field instead.`,
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
        ack_msg: "This form was changed since you loaded it — reload and try again",
      });
    }

    const draftFields = parseSchema(form.schema_json);
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
        );
      }
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
          : "Publish failed — please try again",
      });
    }

    const newSubmissionTableName = mainTable;
    await form.update({
      published_schema_json: form.schema_json,
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
    const options = await getReferenceOptions({ tenantDB: req.tenantDB, master, parentId });
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
      if (access.canFill) visible.push(form);
    }

    return resSuccess({ data: { item: visible } });
  } catch (e) {
    console.error("listPublishedFormsForFilling error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
