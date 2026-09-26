// Public (no-login) form fill path — mirrors customFieldFormService.js's
// getAllCustomFieldFromByUsingCompany exactly (plan §2 "chicken-and-egg
// problem" resolution, verified against that function): resolve company by
// qr_code against the master-DB companyModel (no tenant context needed
// yet), then manually invoke tenantMiddleware to populate req.tenantDB,
// then proceed with normal tenant-scoped queries. share_token is the
// second key, unique only within that company (form_builder_forms'
// composite unique index).
import { QueryTypes } from "sequelize";
import { approvalOf, fieldStageId } from "./formBuilderApproval.js";
import { isInternalOnlyField, isUserMaster } from "./formBuilderLookups.js";
import { parsePublicSettings, publicFormStatus } from "./formBuilderPublicSettings.js";
import { createOtpChallenge, verifyOtpChallenge } from "./formBuilderPublicOtp.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { mainTableName } from "./formBuilderDdlBuilder.js";
import { getReferenceOptions } from "./formBuilderMasterRegistry.js";
import { createFormSubmission, attachUploadedFiles, parseSchema } from "./formBuilderSubmissionService.js";
import { ClaudeOfficeWhatsAppOtp } from "../company_setup/thirdPartyIntegrationService.js";
import { normalizeToTenDigit } from "../../utils/sharedFunctions.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";

// Second language (plan M8): the name the form's owner gave it, e.g. "Gujarati".
function languageNameOf(settingsJson) {
  try {
    const parsed = typeof settingsJson === "string" ? JSON.parse(settingsJson) : settingsJson;
    const name = parsed?.language?.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

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

// Live count of real (non-draft, non-deleted) entries — only run when the
// form actually has a max_entries limit, so most requests skip this query.
async function countLiveEntries(tenantDB, formId) {
  const [row] = await tenantDB.query(`SELECT COUNT(*) AS n FROM \`${mainTableName(formId)}\` WHERE isDelete = 0`, { type: QueryTypes.SELECT });
  return Number(row?.n || 0);
}

export const getPublicFormSchema = async (req) => {
  try {
    const { form, error } = await resolvePublicForm(req);
    if (error) return error;

    const publicSettings = parsePublicSettings(form.published_settings_json);
    const status = publicFormStatus(form.published_settings_json, {
      entryCount: publicSettings.max_entries != null ? await countLiveEntries(req.tenantDB, form.id) : null,
    });
    if (!status.open) {
      return resSuccess({ data: { item: { id: form.id, title: form.title, description: form.description, fields: [], status } } });
    }

    // Strip internal-only fields before ever sending schema to an
    // anonymous client (plan §1 visible_to / §2) — not just hidden by the
    // frontend.
    let fields = parseSchema(form.published_schema_json).filter((f) => !isInternalOnlyField(f));
    // A form with approval stages: the public filler is stage 1 — fields of later stages are not shown.
    const approval = approvalOf(form.published_settings_json);
    if (approval.enabled) fields = fields.filter((f) => fieldStageId(f, approval.stages) === approval.stages[0].id);
    return resSuccess({
      data: {
        item: {
          id: form.id,
          title: form.title,
          description: form.description,
          fields,
          status,
          require_otp: publicSettings.require_otp,
          one_per_mobile: publicSettings.one_per_mobile,
          // Second language (plan M8) — the visitor gets a switch on the fill screen; each field's own
          // "translations" already rode along inside `fields` (they are plain schema_json props).
          language: languageNameOf(form.published_settings_json),
        },
      },
    });
  } catch (e) {
    console.error("getPublicFormSchema error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

// POST /public-form/send-otp { qrCode, shareToken, mobile } -> { token }.
// Rate-limited the same way as submit (publicFormRateLimit). The OTP itself
// never leaves the server except over WhatsApp.
export const sendPublicFormOtp = async (req) => {
  try {
    const { form, error } = await resolvePublicForm(req);
    if (error) return error;
    const settings = parsePublicSettings(form.published_settings_json);
    if (!settings.require_otp) return resError({ ack_msg: "This form doesn't need a code." });

    const status = publicFormStatus(form.published_settings_json, {
      entryCount: settings.max_entries != null ? await countLiveEntries(req.tenantDB, form.id) : null,
    });
    if (!status.open) return resError({ ack_msg: status.message });

    const mobile = String(req.body?.mobile ?? "").trim();
    const tenDigit = normalizeToTenDigit(mobile);
    if (!tenDigit || tenDigit.length !== 12) return resError({ ack_msg: "Enter a valid 10-digit mobile number." });

    const { code, token } = createOtpChallenge(mobile);
    const sent = await ClaudeOfficeWhatsAppOtp(code, tenDigit);
    if (sent?.ack !== 1) {
      return resError({ ack_msg: "Couldn't send the code over WhatsApp. Check the number and try again." });
    }
    return resSuccess({ ack_msg: "A code was sent on WhatsApp.", data: { token } });
  } catch (e) {
    console.error("sendPublicFormOtp error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const submitPublicForm = async (req) => {
  try {
    const { form, company_masters_id, error } = await resolvePublicForm(req);
    if (error) return error;

    const settings = parsePublicSettings(form.published_settings_json);
    const entryCount = settings.max_entries != null ? await countLiveEntries(req.tenantDB, form.id) : null;
    const status = publicFormStatus(form.published_settings_json, { entryCount });
    if (!status.open) return resError({ ack_msg: status.message });

    const { answers, submitter_name, submitter_email, submitter_phone, source, campaign, otp_token, otp_code } = req.body || {};
    const parsedAnswers = typeof answers === "string" ? JSON.parse(answers) : answers;

    if (settings.require_otp) {
      if (!submitter_phone) return resError({ ack_msg: "Enter your mobile number." });
      if (!otp_token || !otp_code) return resError({ ack_msg: "Enter the code sent on WhatsApp." });
      const check = verifyOtpChallenge(otp_token, submitter_phone, otp_code);
      if (!check.ok) return resError({ ack_msg: check.error, data: { item: { otp_token: check.token } } });
    }

    if (settings.one_per_mobile && submitter_phone) {
      // Best-effort exact match on the raw number as typed — good enough to
      // stop a casual repeat submit from the same visitor. A field with
      // match_key: "phone" normalises submitter_phone before storage
      // (createFormSubmission), so returning visitors who fill that field
      // the same way are still caught; someone typing "98765 43210" once and
      // "9876543210" the next time is not.
      const table = mainTableName(form.id);
      const [dupe] = await req.tenantDB.query(
        `SELECT id FROM \`${table}\` WHERE isDelete = 0 AND submitter_phone = :phone LIMIT 1`,
        { replacements: { phone: submitter_phone }, type: QueryTypes.SELECT },
      );
      if (dupe) return resError({ ack_msg: "An entry from this mobile number has already been submitted." });
    }

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
        leadSource: source || null,
        leadCampaign: campaign || null,
      });
    } catch (submissionError) {
      return resError({ code: submissionError.code || 500, ack_msg: submissionError.message });
    }

    if (result.dropped) {
      // Honeypot tripped — pretend success so a bot doesn't learn its
      // check failed (plan §2).
      return resSuccess({ ack_msg: settings.thank_you_message || "Thank you", data: { item: { redirect_url: settings.redirect_url || null } } });
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

    return resSuccess({
      ack_msg: settings.thank_you_message || "Thank you",
      data: { item: { id: result.submissionId, redirect_url: settings.redirect_url || null } },
    });
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
    // Team members are never offered to an anonymous visitor (plan E3).
    if (isUserMaster(master)) return resError({ code: 403, ack_msg: "This list isn't available on a public form" });
    const options = await getReferenceOptions({ tenantDB: req.tenantDB, master, parentId });
    return resSuccess({ data: { item: options } });
  } catch (e) {
    console.error("getPublicReferenceOptions error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
