import { auditLogModel } from "../../models/company_setup/auditLogModel.js";

// Generic, reusable across the whole app — any future module logs into this
// same table with its own module_key, not a document-template-only feature.
// Fire-and-forget from the caller's perspective: a logging failure should
// never break the actual mutation it's describing, so errors are swallowed
// here (logged to console) rather than propagated.
export const logAuditEvent = async (req, { module_key, action, entity_type, entity_id, details }) => {
  try {
    const model = auditLogModel(req.tenantDB);
    await model.create({
      company_masters_id: req.body?.company_masters_id,
      a_application_login_id: req.body?.a_application_login_id,
      module_key,
      action,
      entity_type,
      entity_id,
      details: details ? JSON.stringify(details) : null,
      created_date_time: new Date(),
    });
  } catch (e) {
    console.log("logAuditEvent failed:", e);
  }
};

// Read-side companion to logAuditEvent — was missing entirely (the file
// only ever wrote). form_builder is the first module that needs to read
// its own history back for a UI (form-level and submission-level history,
// see formBuilderService.js's getFormAuditLog and
// formBuilderSubmissionService.js's getSubmissionAuditLog), but this is
// generic and reusable across the whole app the same way logAuditEvent
// already is — any future module can call this too.
export const listAuditLog = async (req, { entity_type, entity_id }) => {
  const model = auditLogModel(req.tenantDB);
  const rows = await model.findAll({
    where: { entity_type, entity_id },
    order: [["created_date_time", "DESC"]],
    raw: true,
  });
  return rows.map((row) => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : null,
  }));
};
