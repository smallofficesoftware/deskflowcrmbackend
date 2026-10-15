// Custom Form Maker submissions print through doc types named `form_<formId>`
// (formSubmissionDocType in formSubmissionGenerate.js). The Document Designer
// asks two lookups about a doc type when it opens: the default template (for the
// "Add Field" picker) and the data dictionary (the field list). Both only knew
// the fixed doc types, so opening a form's print design failed with
// "Unknown document type: form_14" and showed an empty field list. This builds
// the same two answers from the form's published schema.
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { buildDefaultSubmissionTemplate } from "./formSubmissionTemplate.js";

const FORM_DOC_TYPE = /^form_(\d+)$/;

export function parseFormDocTypeId(doc_type) {
  const match = FORM_DOC_TYPE.exec(String(doc_type || ""));
  return match ? Number(match[1]) : null;
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

async function loadPublishedForm(req, formId) {
  const company_masters_id = req.body?.company_masters_id;
  const where = { id: formId, isDelete: 0 };
  if (company_masters_id) where.company_masters_id = company_masters_id;
  const form = await formBuilderFormModel(req.tenantDB).findOne({ where });
  if (!form) throw new Error(`Form not found for doc_type: form_${formId}`);
  return form;
}

// The form's default print template (same one generated when a submission is
// first printed).
export async function buildFormDefaultTemplate(req, doc_type) {
  const form = await loadPublishedForm(req, parseFormDocTypeId(doc_type));
  const fields = parseSchema(form.published_schema_json || form.schema_json);
  return buildDefaultSubmissionTemplate(form.title, fields);
}

const COMPANY_ENTRIES = [
  { key: "companyName", label: "Company Name", group: "Company" },
  { key: "companyAddress", label: "Company Address", group: "Company" },
  { key: "companyGSTIN", label: "Company GSTIN", group: "Company" },
  { key: "companyMobile", label: "Company Mobile", group: "Company" },
  { key: "companyEmail", label: "Company Email", group: "Company" },
];

// Data dictionary: every input name the form's template reads (section
// headings and their values, question tables, repeater tables, the form title)
// plus the company fields every print has.
export async function buildFormDictionary(req, doc_type) {
  const template = await buildFormDefaultTemplate(req, doc_type);
  const seen = new Set();
  const entries = [];
  let lastTitle = "";
  for (const page of template.schemas || []) {
    for (const field of page || []) {
      const key = field?.name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let label = String(field.content || "").trim();
      if (key === "approvals_body") {
        label = "Approvals";
      } else if (/_title$/.test(key)) {
        lastTitle = label || lastTitle;
        label = `${label || key} (heading)`;
      } else if (/_body$/.test(key)) {
        label = lastTitle ? `${lastTitle} — values` : "Details";
      } else if (/_qtable$/.test(key) || /_table$/.test(key)) {
        label = field.type === "table" ? `${key.replace(/_(qtable|table)$/, "")} table` : label || key;
      } else if (!label) {
        label = key;
      }
      entries.push({ key, label, group: "Form" });
    }
  }
  // Older / hand-made templates read the combined block.
  entries.push({ key: "submissionDetails", label: "All details (single block)", group: "Form" });
  return [...entries, ...COMPANY_ENTRIES.filter((c) => !seen.has(c.key))];
}
