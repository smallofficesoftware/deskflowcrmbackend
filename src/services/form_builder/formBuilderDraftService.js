// "Save and continue later" (plan item M7) — the database side. A draft is
// private to the person who saved it. Rules for what a draft holds are in
// formBuilderDrafts.js.
//
//   drafts/save    { form_id, id?, answers }  create, or replace the person's own draft
//   drafts/list    { form_id? }               my drafts (newest first)
//   drafts/get     { id }                     one of my drafts, with the form's left-out note
//   drafts/delete  { id }                     throw a draft away
//
// When an entry is saved for real with draft_id, createInternalSubmissionEntry
// removes that draft (deleteFinishedDraft below).
import { Op } from "sequelize";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { formBuilderDraftModel } from "../../models/form_builder/formBuilderDraftModel.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resolveFormAccess } from "./formBuilderRights.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";
import { cleanDraftAnswers, leftOutOfDraft, MAX_DRAFTS_PER_FORM } from "./formBuilderDrafts.js";

function parseSchema(json) {
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function base(req) {
  const loginId = req.body?.a_application_login_id;
  const company = await getCompanyByLoginId(loginId);
  if (!company) return { error: resError({ ack_msg: "Company not found for login ID" }) };
  return { loginId, company_masters_id: company.company_masters_id, tenantDB: req.tenantDB };
}

async function loadFillableForm(ctx, formId) {
  const id = Number(formId);
  const form = Number.isInteger(id) && id > 0 ? await formBuilderFormModel(ctx.tenantDB).findOne({ where: { id, company_masters_id: ctx.company_masters_id, isDelete: 0 } }) : null;
  if (!form || !form.published_schema_json) return { error: resError({ ack_msg: "Form not found or not published" }) };
  const access = await resolveFormAccess({ form, company_masters_id: ctx.company_masters_id, a_application_login_id: ctx.loginId, tenantDB: ctx.tenantDB });
  if (!access.canFill) return { error: resError({ code: 403, ack_msg: "No access to fill this form" }) };
  return { form };
}

const own = (ctx, extra = {}) => ({ company_masters_id: ctx.company_masters_id, a_application_login_id: ctx.loginId, isDelete: 0, ...extra });

export const saveDraft = async (req) => {
  try {
    const ctx = await base(req);
    if (ctx.error) return ctx.error;
    const { form, error } = await loadFillableForm(ctx, req.body?.form_id);
    if (error) return error;

    let answers = req.body?.answers;
    if (typeof answers === "string") {
      try {
        answers = JSON.parse(answers);
      } catch {
        answers = null;
      }
    }
    const cleaned = cleanDraftAnswers(parseSchema(form.published_schema_json), answers);
    if (cleaned.error) return resError({ ack_msg: cleaned.error });

    const Draft = formBuilderDraftModel(ctx.tenantDB);
    const now = new Date();
    if (req.body?.id) {
      const existing = await Draft.findOne({ where: own(ctx, { id: req.body.id, form_id: form.id }) });
      if (!existing) return resError({ ack_msg: "This draft no longer exists" });
      await existing.update({ answers_json: JSON.stringify(cleaned.answers), updated_date_time: now });
      return resSuccess({ ack_msg: "Draft saved", data: { item: { id: existing.id } } });
    }
    const count = await Draft.count({ where: own(ctx, { form_id: form.id }) });
    if (count >= MAX_DRAFTS_PER_FORM) return resError({ ack_msg: `You already have ${MAX_DRAFTS_PER_FORM} drafts of this form. Finish or delete some first.` });
    const created = await Draft.create({
      company_masters_id: ctx.company_masters_id,
      form_id: form.id,
      a_application_login_id: ctx.loginId,
      answers_json: JSON.stringify(cleaned.answers),
      created_date_time: now,
      updated_date_time: now,
      isDelete: 0,
    });
    return resSuccess({ ack_msg: "Draft saved", data: { item: { id: created.id } } });
  } catch (e) {
    console.error("saveDraft error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const listDrafts = async (req) => {
  try {
    const ctx = await base(req);
    if (ctx.error) return ctx.error;
    const where = own(ctx);
    if (req.body?.form_id) where.form_id = Number(req.body.form_id);
    const rows = await formBuilderDraftModel(ctx.tenantDB).findAll({ where, attributes: ["id", "form_id", "created_date_time", "updated_date_time"], order: [["updated_date_time", "DESC"]], limit: 100, raw: true });
    const formIds = [...new Set(rows.map((r) => r.form_id))];
    const forms = formIds.length ? await formBuilderFormModel(ctx.tenantDB).findAll({ where: { id: { [Op.in]: formIds }, isDelete: 0 }, attributes: ["id", "title"], raw: true }) : [];
    const titles = new Map(forms.map((f) => [f.id, f.title]));
    // A draft of a deleted form is not shown.
    const items = rows.filter((r) => titles.has(r.form_id)).map((r) => ({ ...r, form_title: titles.get(r.form_id) }));
    return resSuccess({ data: { items } });
  } catch (e) {
    console.error("listDrafts error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const getDraft = async (req) => {
  try {
    const ctx = await base(req);
    if (ctx.error) return ctx.error;
    const row = await formBuilderDraftModel(ctx.tenantDB).findOne({ where: own(ctx, { id: req.body?.id }), raw: true });
    if (!row) return resError({ ack_msg: "This draft no longer exists" });
    const { form, error } = await loadFillableForm(ctx, row.form_id);
    if (error) return error;
    let answers = {};
    try {
      answers = JSON.parse(row.answers_json);
    } catch {
      answers = {};
    }
    return resSuccess({ data: { item: { id: row.id, form_id: row.form_id, answers, left_out: leftOutOfDraft(parseSchema(form.published_schema_json)) } } });
  } catch (e) {
    console.error("getDraft error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const deleteDraft = async (req) => {
  try {
    const ctx = await base(req);
    if (ctx.error) return ctx.error;
    const [count] = await formBuilderDraftModel(ctx.tenantDB).update({ isDelete: 1 }, { where: own(ctx, { id: req.body?.id }) });
    if (!count) return resError({ ack_msg: "This draft no longer exists" });
    return resSuccess({ ack_msg: "Draft deleted" });
  } catch (e) {
    console.error("deleteDraft error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// The entry was saved for real — its draft is no longer needed. Only the
// person's own draft of this same form is touched.
export async function deleteFinishedDraft({ tenantDB, company_masters_id, form_id, loginId, draftId }) {
  const id = Number(draftId);
  if (!Number.isInteger(id) || id <= 0) return;
  await formBuilderDraftModel(tenantDB).update({ isDelete: 1 }, { where: { id, form_id, company_masters_id, a_application_login_id: loginId, isDelete: 0 } });
}
