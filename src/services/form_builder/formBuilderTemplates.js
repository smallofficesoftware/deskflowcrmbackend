// Form templates (plan items L1-L3).
//
//   POST /form-builder/templates/list           -> { builtin: [...], company: [...] }   (no schemas, for the picker)
//   POST /form-builder/templates/save-from-form { form_id, title, description? }       "Save as template"
//   POST /form-builder/templates/delete         { id }
//   POST /form-builder/create                   { title, template: { source: "builtin" | "company", key | id } }
//
// Built-in starter forms are code (formBuilderBuiltinTemplates.js); company
// templates are rows of form_builder_templates. Listing is open to anyone who
// can create forms; saving / deleting needs the same add / edit right.
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { formBuilderTemplateModel } from "../../models/form_builder/formBuilderTemplateModel.js";
import { resolveFormBuilderRights } from "./formBuilderRights.js";
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from "./formBuilderBuiltinTemplates.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";
import { logAuditEvent } from "../company_setup/auditLogServices.js";

const MODULE_KEY = "form_builder";
const ENTITY_TYPE_TEMPLATE = "form_builder_template";
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 500;

function parseArray(json) {
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// A form definition from a template: `fields` are the template's fields
// (deep-copied) with every field and repeater column given a fresh positive
// id — the server names a repeater's table after the field id, so ids must
// be unique and > 0. Returns { schema_json, settings_json } as JSON text.
export function instantiateTemplate({ fields, settings = null }) {
  let nextId = 1;
  const copy = JSON.parse(JSON.stringify(Array.isArray(fields) ? fields : []));
  for (const field of copy) {
    field.id = nextId++;
    if (Array.isArray(field.columns)) {
      for (const column of field.columns) column.id = nextId++;
    }
  }
  return {
    schema_json: JSON.stringify(copy),
    settings_json: settings ? (typeof settings === "string" ? settings : JSON.stringify(settings)) : null,
  };
}

export function summarizeTemplate(t) {
  const fields = Array.isArray(t.fields) ? t.fields : [];
  return {
    title: t.title,
    description: t.description || "",
    category: t.category || null,
    field_count: fields.filter((x) => x.type !== "section-header" && x.type !== "instruction").length,
  };
}

async function loadContext(req, { needsChange = false } = {}) {
  const a_application_login_id = req.body?.a_application_login_id;
  const company = await getCompanyByLoginId(a_application_login_id);
  if (!company) return { error: resError({ ack_msg: "Company not found for login ID" }) };
  const company_masters_id = company.company_masters_id;
  const rights = await resolveFormBuilderRights({ company_masters_id, a_application_login_id, tenantDB: req.tenantDB });
  const allowed = rights.isOwner || rights.canAdd || (needsChange && rights.canEdit);
  if (!allowed) return { error: resError({ code: 403, ack_msg: "You don't have permission to work with form templates" }) };
  return { a_application_login_id, company_masters_id };
}

export const listTemplates = async (req) => {
  try {
    const { company_masters_id, error } = await loadContext(req);
    if (error) return error;
    const rows = await formBuilderTemplateModel(req.tenantDB).findAll({
      where: { company_masters_id, isDelete: 0 },
      order: [["title", "ASC"]],
      raw: true,
    });
    return resSuccess({
      data: {
        builtin: BUILTIN_TEMPLATES.map((t) => ({ key: t.key, ...summarizeTemplate(t) })),
        company: rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description || "",
          field_count: parseArray(r.schema_json).filter((x) => x.type !== "section-header" && x.type !== "instruction").length,
          created_date_time: r.created_date_time,
        })),
      },
    });
  } catch (e) {
    console.error("listTemplates error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const saveTemplateFromForm = async (req) => {
  try {
    const { a_application_login_id, company_masters_id, error } = await loadContext(req);
    if (error) return error;

    const { form_id, title, description } = req.body || {};
    const cleanTitle = String(title ?? "").trim();
    if (!cleanTitle) return resError({ ack_msg: "Give the template a name." });
    if (cleanTitle.length > TITLE_MAX) return resError({ ack_msg: `The name can be at most ${TITLE_MAX} characters.` });
    const cleanDescription = String(description ?? "").trim().slice(0, DESCRIPTION_MAX);

    const form = await formBuilderFormModel(req.tenantDB).findOne({ where: { id: form_id, company_masters_id, isDelete: 0 } });
    if (!form) return resError({ ack_msg: "Form not found" });
    const fields = parseArray(form.schema_json);
    if (fields.length === 0) return resError({ ack_msg: "Add some fields to the form first — an empty form makes an empty template." });

    const Template = formBuilderTemplateModel(req.tenantDB);
    const same = await Template.findOne({ where: { company_masters_id, isDelete: 0, title: cleanTitle }, raw: true });
    if (same) return resError({ ack_msg: `You already have a template called “${cleanTitle}”. Pick another name.` });

    const created = await Template.create({
      company_masters_id,
      title: cleanTitle,
      description: cleanDescription || null,
      schema_json: JSON.stringify(fields),
      settings_json: form.settings_json || null,
      created_by_a_application_login_id: a_application_login_id,
      created_date_time: new Date(),
    });
    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "create_template",
      entity_type: ENTITY_TYPE_TEMPLATE,
      entity_id: created.id,
      details: { title: cleanTitle, from_form_id: form.id },
    });
    return resSuccess({ ack_msg: "Template saved", data: { item: { id: created.id, title: created.title } } });
  } catch (e) {
    console.error("saveTemplateFromForm error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteTemplate = async (req) => {
  try {
    const { company_masters_id, error } = await loadContext(req, { needsChange: true });
    if (error) return error;
    const row = await formBuilderTemplateModel(req.tenantDB).findOne({ where: { id: req.body?.id, company_masters_id, isDelete: 0 } });
    if (!row) return resError({ ack_msg: "Template not found" });
    await row.update({ isDelete: 1 });
    await logAuditEvent(req, {
      module_key: MODULE_KEY,
      action: "delete_template",
      entity_type: ENTITY_TYPE_TEMPLATE,
      entity_id: row.id,
      details: { title: row.title },
    });
    return resSuccess({ ack_msg: "Template deleted" });
  } catch (e) {
    console.error("deleteTemplate error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// For createForm: { schema_json, settings_json, description? } for the chosen
// template, or { error } (plain message). No template chosen -> null.
export async function resolveTemplateForCreate({ tenantDB, company_masters_id, template }) {
  if (!template || typeof template !== "object") return null;
  if (template.source === "builtin") {
    const t = getBuiltinTemplate(template.key);
    if (!t) return { error: "That starter form isn't available any more." };
    return { ...instantiateTemplate({ fields: t.fields }), description: t.description };
  }
  if (template.source === "company") {
    const row = await formBuilderTemplateModel(tenantDB).findOne({ where: { id: template.id, company_masters_id, isDelete: 0 }, raw: true });
    if (!row) return { error: "That template was deleted." };
    return { ...instantiateTemplate({ fields: parseArray(row.schema_json), settings: row.settings_json }), description: row.description || null };
  }
  return { error: "Choose a starter form or a saved template." };
}
