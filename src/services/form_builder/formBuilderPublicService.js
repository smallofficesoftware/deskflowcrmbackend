// Public (no-login) form fill path — mirrors customFieldFormService.js's
// getAllCustomFieldFromByUsingCompany exactly (plan §2 "chicken-and-egg
// problem" resolution, verified against that function): resolve company by
// qr_code against the master-DB companyModel (no tenant context needed
// yet), then manually invoke tenantMiddleware to populate req.tenantDB,
// then proceed with normal tenant-scoped queries. share_token is the
// second key, unique only within that company (form_builder_forms'
// composite unique index).
import companyModel from "../../models/company_setup/companyModel.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { getReferenceOptions } from "./formBuilderMasterRegistry.js";
import { createFormSubmission, attachUploadedFiles, parseSchema } from "./formBuilderSubmissionService.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";

async function resolvePublicForm(req) {
  const { qrCode, shareToken } = req.body || {};
  const companyRow = await companyModel.findOne({
    where: { qr_code: qrCode },
    attributes: ["id", "a_application_login_id"],
  });
  if (!companyRow) {
    return { error: resError({ ack_msg: "Not found" }) };
  }

  const company_masters_id = companyRow.id;
  req.headers = req.headers || {};
  req.headers["x-tenant-id"] = companyRow.a_application_login_id;
  req.headers["x-company-id"] = company_masters_id;
  req.body.company_masters_id = company_masters_id;

  await new Promise((resolve, reject) => {
    tenantMiddleware(req, {}, (err) => (err ? reject(err) : resolve()));
  });

  const FormModel = formBuilderFormModel(req.tenantDB);
  const form = await FormModel.findOne({
    where: { company_masters_id, share_token: shareToken, isDelete: 0, allow_public_submission: 1 },
  });
  if (!form || !form.published_schema_json) {
    // Same 404 whether the token is wrong or the form was disabled —
    // never distinguish "wrong token" from "link disabled" to a public
    // caller (plan §2: allow_public_submission checked live, every request).
    return { error: resError({ ack_msg: "Not found" }) };
  }

  return { form, company_masters_id };
}

export const getPublicFormSchema = async (req) => {
  try {
    const { form, error } = await resolvePublicForm(req);
    if (error) return error;

    // Strip internal-only fields before ever sending schema to an
    // anonymous client (plan §1 visible_to / §2) — not just hidden by the
    // frontend.
    const fields = parseSchema(form.published_schema_json).filter((f) => f.visible_to !== "internal");
    return resSuccess({ data: { item: { id: form.id, title: form.title, description: form.description, fields } } });
  } catch (e) {
    console.error("getPublicFormSchema error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const submitPublicForm = async (req) => {
  try {
    const { form, company_masters_id, error } = await resolvePublicForm(req);
    if (error) return error;

    const { answers, submitter_name, submitter_email, submitter_phone } = req.body || {};
    const parsedAnswers = typeof answers === "string" ? JSON.parse(answers) : answers;

    let result;
    try {
      result = await createFormSubmission({
        tenantDB: req.tenantDB,
        form,
        company_masters_id,
        submittedByType: "public",
        submitterName: submitter_name,
        submitterEmail: submitter_email,
        submitterPhone: submitter_phone,
        answers: parsedAnswers,
        relatedRecordId: null, // never trusted from a public caller regardless of payload
        sourceIp: req.ip || req.headers["x-forwarded-for"] || null,
      });
    } catch (submissionError) {
      return resError({ code: submissionError.code || 500, ack_msg: submissionError.message });
    }

    if (result.dropped) {
      // Honeypot tripped — pretend success so a bot doesn't learn its
      // check failed (plan §2).
      return resSuccess({ ack_msg: "Thank you" });
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

    return resSuccess({ ack_msg: "Thank you", data: { item: { id: result.submissionId } } });
  } catch (e) {
    console.error("submitPublicForm error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const getPublicReferenceOptions = async (req) => {
  try {
    const { error } = await resolvePublicForm(req);
    if (error) return error;
    const { master, parentId } = req.body || {};
    const options = await getReferenceOptions({ tenantDB: req.tenantDB, master, parentId });
    return resSuccess({ data: { item: options } });
  } catch (e) {
    console.error("getPublicReferenceOptions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
