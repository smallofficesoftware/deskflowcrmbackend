// Lets Report Builder (and so Dashboard widgets, which are pointers to saved
// reports) read Form Builder data. A form's submissions live in a dynamic
// per-form table, fbs_<formId>, which can never be in modelRegistry.js's
// hard-coded whitelist. This file keeps the whitelist rule intact: for a
// model_key of the form "form:<formId>" it builds a registry-shaped entry
// ON THE FLY from that form's PUBLISHED schema (published_schema_json) -
// only columns that schema declares (plus a few fixed columns) are ever
// allowed, nothing comes from user input. Nothing in modelRegistry.js is
// changed or mutated; static keys still resolve through it exactly as before.
//
// v1 limits: main table only (repeater child tables are not reportable),
// no question-table/file/signature/image fields (no queryable column),
// fields the form marks "hide" or "mask" are left out entirely (Report
// Builder has no per-viewer "see restricted fields" notion, so it fails
// closed), composite reports and dashboard "general filters" (date range /
// team) are not available for form sources.
import { DataTypes, literal, Op } from "sequelize";
import { contactModel } from "../../models/activities/contactModel.js";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { NO_COLUMN_TYPES, mainTableName, repeaterTableName } from "../form_builder/formBuilderDdlBuilder.js";
import { restrictionOf } from "../form_builder/formBuilderFieldRestrictions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { getRegisteredModel, resolveRelationColumns } from "./modelRegistry.js";

// "form:<formId>" = the form's main table; "form:<formId>:r<repeaterFieldId>"
// = one repeater field's rows (fbs_<formId>_r<repeaterFieldId>).
const FORM_KEY_PATTERN = /^form:(\d+)(?::r(\d+))?$/;
const NUMERIC_AGGS = ["sum", "avg", "min", "max"];

export const isFormModelKey = (modelKey) => typeof modelKey === "string" && FORM_KEY_PATTERN.test(modelKey);

// { formId, repeaterId|null } or null.
export const parseFormModelKey = (modelKey) => {
  const m = typeof modelKey === "string" ? FORM_KEY_PATTERN.exec(modelKey) : null;
  return m ? { formId: Number(m[1]), repeaterId: m[2] ? Number(m[2]) : null } : null;
};

// Only ever interpolated into SQL after passing through this.
const asInt = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error("formModelResolver: expected an integer id");
  return n;
};

function parseFields(json) {
  if (!json) return [];
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Fixed columns every fbs_<formId> table has. Drafts/soft-deleted rows are
// excluded separately (baseWhere + the engine's own isDelete:0).
const FIXED_COLUMNS = {
  id: { label: "Entry ID", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["count"] },
  created_date_time: { label: "Submitted Date", type: "date", filterable: true, sortable: true, groupable: false },
  current_stage: { label: "Stage", type: "string", filterable: true, sortable: false, groupable: true },
  stage_status: { label: "Stage Status", type: "string", filterable: true, sortable: false, groupable: true },
  submission_status_id: { label: "Status", type: "lookup", filterable: true, sortable: false, groupable: true },
  related_record_id: { label: "Linked Record ID", type: "lookup", filterable: true, sortable: false, groupable: true },
  submitter_name: { label: "Submitted By (name)", type: "string", filterable: true, sortable: false, groupable: true },
};

const FIXED_ATTRIBUTES = {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  company_masters_id: { type: DataTypes.INTEGER },
  submitted_by_a_application_login_id: { type: DataTypes.INTEGER },
  submitter_name: { type: DataTypes.STRING },
  related_record_id: { type: DataTypes.INTEGER },
  submission_status_id: { type: DataTypes.INTEGER },
  current_stage: { type: DataTypes.STRING },
  stage_status: { type: DataTypes.STRING },
  is_draft: { type: DataTypes.TINYINT },
  created_date_time: { type: DataTypes.DATE },
  isDelete: { type: DataTypes.TINYINT },
};

// Report column def + Sequelize attribute for one form field, or null when
// the field has no queryable column.
function columnForField(field) {
  if (!field || !field.key || NO_COLUMN_TYPES.has(field.type)) return null;
  const restriction = restrictionOf(field);
  if (restriction === "hide" || restriction === "mask") return null;
  const label = field.label || field.key;
  const filterable = true;
  switch (field.type) {
    case "number":
    case "rating":
      return { def: { label, type: "number", filterable, sortable: true, groupable: false, aggregatable: NUMERIC_AGGS }, attr: { type: DataTypes.DECIMAL(18, 4) } };
    case "currency":
      return { def: { label, type: "currency", filterable, sortable: true, groupable: false, aggregatable: NUMERIC_AGGS }, attr: { type: DataTypes.DECIMAL(18, 2) } };
    case "percentage":
      return { def: { label, type: "number", filterable, sortable: true, groupable: false, aggregatable: NUMERIC_AGGS }, attr: { type: DataTypes.DECIMAL(9, 2) } };
    case "calculation":
      if (field.result_type === "date") {
        return { def: { label, type: "date", filterable, sortable: true, groupable: false }, attr: { type: DataTypes.DATEONLY } };
      }
      return { def: { label, type: "number", filterable, sortable: true, groupable: false, aggregatable: NUMERIC_AGGS }, attr: { type: DataTypes.DECIMAL(18, 4) } };
    case "date":
      return { def: { label, type: "date", filterable, sortable: true, groupable: false }, attr: { type: DataTypes.DATEONLY } };
    case "datetime":
      return { def: { label, type: "date", filterable, sortable: true, groupable: false }, attr: { type: DataTypes.DATE } };
    case "time":
      return { def: { label, type: "string", filterable, sortable: false, groupable: false }, attr: { type: DataTypes.TIME } };
    case "checkbox":
    case "switch":
    case "consent":
      return { def: { label, type: "lookup", filterable, sortable: false, groupable: true }, attr: { type: DataTypes.TINYINT } };
    case "dropdown":
    case "radio":
      return { def: { label, type: "string", filterable, sortable: false, groupable: true }, attr: { type: DataTypes.STRING } };
    case "customer-lookup":
    case "user":
    case "reference":
      return { def: { label, type: "lookup", filterable, sortable: false, groupable: true }, attr: { type: DataTypes.INTEGER } };
    case "question-table":
      return null;
    case "textarea":
    case "address":
    case "multi-select":
      return { def: { label, type: "string", filterable, sortable: false, groupable: false }, attr: { type: DataTypes.TEXT } };
    default:
      // text, phone, email, url, auto-number, location, barcode
      return { def: { label, type: "string", filterable, sortable: field.type === "auto-number", groupable: field.type === "text" }, attr: { type: DataTypes.STRING } };
  }
}

// Sequelize model for fbs_<formId>, defined on the tenant connection. Reused
// while the column signature is unchanged; redefined after a republish that
// changed the schema (so a stale model never serves the old columns).
function getOrDefineFormModel(tenantDB, name, attributes) {
  const signature = Object.keys(attributes).sort().join("|");
  const existing = tenantDB.models?.[name];
  if (existing && existing.__reportSignature === signature) return existing;
  if (existing && typeof tenantDB.modelManager?.removeModel === "function") {
    tenantDB.modelManager.removeModel(existing);
  }
  const model = tenantDB.define(name, attributes, { tableName: name, freezeTableName: true, timestamps: false });
  model.__reportSignature = signature;
  return model;
}

const STATUS_RELATION = {
  label: "Status",
  foreignKey: "submission_status_id",
  getModel: (tenantDB) => stagestatusModel(tenantDB),
  targetKey: "id",
  columns: {
    name: { label: "Status Name", type: "string" },
    color: { label: "Status Colour", type: "string" },
  },
};

// Registry-shaped entry for one form, or null (unknown / not published /
// other company's form / deleted).
export async function resolveFormModelEntry(modelKey, tenantDB, company_masters_id) {
  const parsed = parseFormModelKey(modelKey);
  if (!parsed || !tenantDB || !company_masters_id) return null;
  const { formId, repeaterId } = parsed;

  const form = await formBuilderFormModel(tenantDB).findOne({
    where: { id: formId, company_masters_id, isDelete: 0 },
    attributes: ["id", "title", "published_schema_json"],
    raw: true,
  });
  if (!form || !form.published_schema_json) return null;

  const fields = parseFields(form.published_schema_json);
  if (repeaterId) return buildRepeaterEntry({ form, formId, repeaterId, fields, tenantDB, company_masters_id });

  const columns = { ...FIXED_COLUMNS };
  const attributes = { ...FIXED_ATTRIBUTES };
  const relations = { status: STATUS_RELATION };

  for (const field of fields) {
    const built = columnForField(field);
    if (!built) continue;
    // A field key never overrides a fixed column.
    if (columns[field.key] || attributes[field.key]) continue;
    columns[field.key] = built.def;
    attributes[field.key] = built.attr;
    if (field.type === "customer-lookup") {
      relations[field.key] = {
        label: field.label || field.key,
        foreignKey: field.key,
        getModel: (db) => contactModel(db),
        targetKey: "id",
        modelKey: "contacts",
      };
    }
  }

  return {
    label: `Form: ${form.title}`,
    isFormModel: true,
    formId,
    // The fbs table has no a_application_login_id; "own" scope means the
    // person who submitted the entry.
    ownerColumn: "submitted_by_a_application_login_id",
    // Drafts are never part of a report.
    baseWhere: { is_draft: 0 },
    columns,
    relations,
    getModel: (db) => getOrDefineFormModel(db, mainTableName(formId), attributes),
  };
}

// Rows of ONE repeater field (fbs_<formId>_r<repeaterId>). The child table
// has no company / owner / soft-delete / draft columns of its own, so access
// is decided entirely through the PARENT entry: a child row is visible only
// if its submission_id belongs to a parent row of this company that is not
// deleted, not a draft, and (for "own" scope) was submitted by the viewer.
// Parent columns are exposed (display only) through the "entry" relation.
async function buildRepeaterEntry({ form, formId, repeaterId, fields, tenantDB, company_masters_id }) {
  const repeater = fields.find((f) => f && f.type === "repeater" && Number(f.id) === repeaterId);
  if (!repeater) return null;
  const restriction = restrictionOf(repeater);
  if (restriction === "hide" || restriction === "mask") return null;

  const parentEntry = await resolveFormModelEntry(`form:${formId}`, tenantDB, company_masters_id);
  if (!parentEntry) return null;

  const columns = {
    id: { label: "Row ID", type: "number", filterable: true, sortable: true, groupable: false, aggregatable: ["count"] },
    row_order: { label: "Row No.", type: "number", filterable: true, sortable: true, groupable: false },
  };
  const attributes = {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    submission_id: { type: DataTypes.INTEGER },
    row_order: { type: DataTypes.INTEGER },
  };
  for (const field of Array.isArray(repeater.columns) ? repeater.columns : []) {
    const built = columnForField(field);
    if (!built) continue;
    if (columns[field.key] || attributes[field.key]) continue;
    columns[field.key] = built.def;
    attributes[field.key] = built.attr;
  }

  const parentTable = mainTableName(formId);
  const companyId = asInt(company_masters_id);
  const childTable = repeaterTableName(formId, repeaterId);

  return {
    label: `Form: ${form.title} > ${repeater.label || repeater.key} (rows)`,
    isFormModel: true,
    formId,
    repeaterId,
    // Child table has no isDelete column - queryEngine must not add one.
    noSoftDelete: true,
    // Replaces the engine's company/owner scope (neither column exists here).
    buildRightsWhere: (scope, loginId) => {
      let ownClause = "";
      if (scope === "own" || scope === "chain") ownClause = ` AND p.submitted_by_a_application_login_id = ${asInt(loginId)}`;
      else if (scope !== "all") return null;
      return {
        submission_id: {
          [Op.in]: literal(`(SELECT p.id FROM \`${parentTable}\` p WHERE p.company_masters_id = ${companyId} AND p.isDelete = 0 AND p.is_draft = 0${ownClause})`),
        },
      };
    },
    columns,
    relations: {
      entry: {
        label: "Entry",
        foreignKey: "submission_id",
        getModel: parentEntry.getModel,
        targetKey: "id",
        columns: Object.fromEntries(Object.entries(parentEntry.columns).map(([k, def]) => [k, { label: def.label, type: def.type }])),
      },
    },
    getModel: (db) => getOrDefineFormModel(db, childTable, attributes),
  };
}

// One lookup for every consumer: static registry first (unchanged), then
// the form resolver for "form:<id>" keys.
export async function resolveModelEntry(modelKey, tenantDB, company_masters_id) {
  const staticEntry = getRegisteredModel(modelKey);
  if (staticEntry) return staticEntry;
  return resolveFormModelEntry(modelKey, tenantDB, company_masters_id);
}

// Create/preview-time whitelist check for a model_key typed by a logged-in
// user: static key, or a published form of that user's own company.
export async function isModelKeyAllowed(modelKey, tenantDB, a_application_login_id) {
  if (getRegisteredModel(modelKey)) return true;
  if (!isFormModelKey(modelKey)) return false;
  const company = await getCompanyByLoginId(a_application_login_id);
  if (!company) return false;
  return !!(await resolveFormModelEntry(modelKey, tenantDB, company.company_masters_id));
}

// Picker listing: every published, non-deleted form of the company, in the
// same serializable shape listModelRegistry() returns for static tables.
export async function listFormModels(tenantDB, company_masters_id) {
  if (!tenantDB || !company_masters_id) return [];
  const forms = await formBuilderFormModel(tenantDB).findAll({
    where: { company_masters_id, isDelete: 0 },
    attributes: ["id", "published_schema_json"],
    order: [["id", "ASC"]],
    raw: true,
  });
  const out = [];
  const serialize = (key, entry) => ({
    key,
    label: entry.label,
    columns: Object.entries(entry.columns).map(([columnKey, columnDef]) => ({ key: columnKey, ...columnDef })),
    relations: Object.entries(entry.relations).map(([relKey, relDef]) => ({
      key: relKey,
      label: relDef.label,
      foreignKey: relDef.foreignKey,
      matchMode: relDef.matchMode || null,
      columns: Object.entries(resolveRelationColumns(relDef)).map(([columnKey, columnDef]) => ({ key: `${relKey}.${columnKey}`, ...columnDef })),
      relations: [],
    })),
    generalFilters: {},
  });
  for (const form of forms) {
    if (!form.published_schema_json) continue;
    const key = `form:${form.id}`;
    const entry = await resolveFormModelEntry(key, tenantDB, company_masters_id);
    if (!entry) continue;
    out.push(serialize(key, entry));
    // One extra source per repeater field: its rows.
    for (const field of parseFields(form.published_schema_json)) {
      if (!field || field.type !== "repeater") continue;
      const repeaterKey = `form:${form.id}:r${field.id}`;
      const repeaterEntry = await resolveFormModelEntry(repeaterKey, tenantDB, company_masters_id);
      if (repeaterEntry) out.push(serialize(repeaterKey, repeaterEntry));
    }
  }
  return out;
}

// Same slim shape getGeneralFilterMeta() returns for static tables, for the
// run screen's per-column filters. No generalFilters for forms.
export function getFormFilterMeta(entry) {
  const filterableColumns = {};
  for (const [key, def] of Object.entries(entry.columns)) {
    if (def.filterable) filterableColumns[key] = { type: def.type, label: def.label };
  }
  return { generalFilters: {}, columnTypes: {}, filterableColumns };
}
