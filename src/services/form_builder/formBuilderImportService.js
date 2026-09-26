// Excel import of old records (plan item Q3/Q4) — the database side. The
// cell rules live in formBuilderImport.js; every row then goes through the
// same createFormSubmission a person's own save uses, so all the normal rules
// (required, formats, conditions, date rights, auto number, approval stage 1)
// apply, and a row that fails is reported without stopping the others.
//
//   import/columns  the columns of the sample sheet for this form
//   import/run      { rows: [{ row_number, cells: { <field key>: value } }], dry_run }
//                   dry_run = check only (preview), otherwise save the valid rows
import { formBuilderFormModel } from "../../models/form_builder/formBuilderFormModel.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { resolveFormAccess } from "./formBuilderRights.js";
import { hasFormPermission } from "./formBuilderPermissions.js";
import { resolveRestrictions, writeLockedKeys } from "./formBuilderFieldRestrictions.js";
import { approvalOf, editableKeysAt } from "./formBuilderApproval.js";
import { createFormSubmission, parseSchema } from "./formBuilderSubmissionService.js";
import { IMPORT_ROW_CAP, importColumns, rowToAnswers } from "./formBuilderImport.js";
import { resSuccess, resError } from "../../utils/sharedFunctions.js";

async function loadImportContext(req) {
  const loginId = req.body?.a_application_login_id;
  const company = await getCompanyByLoginId(loginId);
  if (!company) return { error: resError({ ack_msg: "Company not found for login ID" }) };
  const company_masters_id = company.company_masters_id;
  const tenantDB = req.tenantDB;

  const formId = Number(req.body?.form_id || req.body?.formId);
  const form = Number.isInteger(formId) && formId > 0 ? await formBuilderFormModel(tenantDB).findOne({ where: { id: formId, company_masters_id, isDelete: 0 } }) : null;
  if (!form || !form.published_schema_json) return { error: resError({ ack_msg: "Form not found or not published" }) };

  const access = await resolveFormAccess({ form, company_masters_id, a_application_login_id: loginId, tenantDB });
  if (!access.canFill) return { error: resError({ code: 403, ack_msg: "No access to fill this form" }) };
  const can = (permissionKey) => hasFormPermission({ form, permissionKey, loginId, company_masters_id, tenantDB });
  if (!(await can("import_excel"))) return { error: resError({ code: 403, ack_msg: "You don't have the right to import entries into this form" }) };

  const fields = parseSchema(form.published_schema_json);
  const restrictions = await resolveRestrictions({ form, fields, loginId, company_masters_id, tenantDB });
  const writeLocked = writeLockedKeys(restrictions);
  const canOverrideAutoNumber = await can("override_auto_number");
  const canChangeDates = await can("change_dates");

  // Columns the person could fill by hand: not locked by a restriction, and
  // (with approval stages) only stage 1's own fields.
  let lockedKeys = new Set(writeLocked || []);
  const approval = approvalOf(form.published_settings_json);
  if (approval.enabled) {
    const firstStage = editableKeysAt(fields, approval.stages, approval.stages[0].id);
    fields.filter((f) => f.key && !firstStage.has(f.key)).forEach((f) => lockedKeys.add(f.key));
  }
  const columns = importColumns(
    fields.filter((f) => !lockedKeys.has(f.key)),
    { canOverrideAutoNumber },
  );
  return { ctx: { loginId, company_masters_id, tenantDB, form, fields, writeLocked, canOverrideAutoNumber, canChangeDates, columns } };
}

export const getImportColumns = async (req) => {
  try {
    const { ctx, error } = await loadImportContext(req);
    if (error) return error;
    const skipped = ctx.fields
      .filter((f) => f.key && ["repeater", "question-table", "file", "image", "signature", "location", "calculation", "reference", "user", "customer-lookup"].includes(f.type))
      .map((f) => f.label || f.key);
    return resSuccess({
      data: {
        form_title: ctx.form.title,
        columns: ctx.columns,
        can_keep_numbers: ctx.canOverrideAutoNumber,
        can_set_dates: ctx.canChangeDates,
        skipped_fields: skipped,
        max_rows_per_request: IMPORT_ROW_CAP,
      },
    });
  } catch (e) {
    console.error("getImportColumns error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const runImport = async (req) => {
  try {
    const { ctx, error } = await loadImportContext(req);
    if (error) return error;

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || !rows.length) return resError({ ack_msg: "The sheet has no rows to import" });
    if (rows.length > IMPORT_ROW_CAP) return resError({ ack_msg: `Send at most ${IMPORT_ROW_CAP} rows at a time` });
    const dryRun = req.body?.dry_run === true || req.body?.dry_run === "true" || req.body?.dry_run === 1;
    const batchLabel = String(req.body?.batch_label || `import ${new Date().toISOString().slice(0, 10)}`).slice(0, 100);

    const results = [];
    for (let i = 0; i < rows.length; i += 1) {
      const rowNumber = Number(rows[i]?.row_number) || i + 1;
      const { answers, errors } = rowToAnswers(ctx.columns, rows[i]?.cells);
      if (errors.length) {
        results.push({ row_number: rowNumber, ok: false, errors });
        continue;
      }
      if (!Object.keys(answers).length) {
        results.push({ row_number: rowNumber, ok: false, errors: ["The row is empty"] });
        continue;
      }
      try {
        const saved = await createFormSubmission({
          tenantDB: ctx.tenantDB,
          form: ctx.form,
          company_masters_id: ctx.company_masters_id,
          submittedByType: "internal",
          a_application_login_id: ctx.loginId,
          answers,
          canChangeDates: ctx.canChangeDates,
          canOverrideAutoNumber: ctx.canOverrideAutoNumber,
          writeLocked: ctx.writeLocked,
          importTag: batchLabel,
          dryRun,
        });
        results.push({ row_number: rowNumber, ok: true, submission_id: saved?.submissionId || null });
      } catch (rowError) {
        results.push({ row_number: rowNumber, ok: false, errors: String(rowError.message || "This row could not be saved").split("; ") });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return resSuccess({
      ack_msg: dryRun ? `${okCount} of ${results.length} rows are ready to import` : `${okCount} of ${results.length} rows imported`,
      data: { dry_run: dryRun, total: results.length, ok: okCount, failed: results.length - okCount, results },
    });
  } catch (e) {
    console.error("runImport error:", e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};
