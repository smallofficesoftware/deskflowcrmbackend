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
