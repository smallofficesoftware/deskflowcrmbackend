import {
  listFormsController,
  getFormController,
  createFormController,
  updateDraftFormController,
  publishFormController,
  discardDraftFormController,
  deleteFormController,
  duplicateFormController,
  togglePublicLinkController,
  regenerateShareTokenController,
  listFormTeamRightsController,
  saveFormTeamRightsController,
  getFormAuditLogController,
  referenceOptionsController,
  listPublishedFormsForFillingController,
  createSubmissionController,
  updateSubmissionController,
  listSubmissionsController,
  getSubmissionController,
  deleteSubmissionController,
  updateSubmissionStatusController,
  linkDuplicateContactController,
  dismissDuplicateContactController,
  getSubmissionAuditLogController,
  exportSubmissionPdfEndpointController,
  exportSubmissionsBulkPdfController,
  exportSubmissionsExcelController,
} from "../../controllers/form_builder/formBuilderController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { formBuilderUpload } from "../../middlewares/multer.js";

export default (app) => {
  // Custom Form Maker — internal (authenticated) routes. No PIN gate (plan
  // §2 correction): matches reportDefinitionRouter.js exactly, just
  // authenticateToken + tenantMiddleware; build-tier access is enforced
  // service-side via formBuilderRights.js's two-tier model.
  app.post("/form-builder/list", authenticateToken, tenantMiddleware, listFormsController);
  app.post("/form-builder/get", authenticateToken, tenantMiddleware, getFormController);
  app.post("/form-builder/create", authenticateToken, tenantMiddleware, createFormController);
  app.post("/form-builder/update", authenticateToken, tenantMiddleware, updateDraftFormController);
  app.post("/form-builder/publish", authenticateToken, tenantMiddleware, publishFormController);
  app.post("/form-builder/discard-draft", authenticateToken, tenantMiddleware, discardDraftFormController);
  app.post("/form-builder/delete", authenticateToken, tenantMiddleware, deleteFormController);
  app.post("/form-builder/duplicate", authenticateToken, tenantMiddleware, duplicateFormController);
  app.post("/form-builder/toggle-public-link", authenticateToken, tenantMiddleware, togglePublicLinkController);
  app.post("/form-builder/regenerate-share-token", authenticateToken, tenantMiddleware, regenerateShareTokenController);
  app.post("/form-builder/reference-options", authenticateToken, tenantMiddleware, referenceOptionsController);
  app.post("/form-builder/:id/audit-log", authenticateToken, tenantMiddleware, getFormAuditLogController);
  app.post("/form-builder/:id/team-rights/list", authenticateToken, tenantMiddleware, listFormTeamRightsController);
  app.post("/form-builder/:id/team-rights", authenticateToken, tenantMiddleware, saveFormTeamRightsController);
  app.post("/form-builder/published/list", authenticateToken, tenantMiddleware, listPublishedFormsForFillingController);

  // Submissions — internal fill/manage. formBuilderUpload (.any()) parses
  // multipart bodies for create/update so file/signature/image field
  // answers arrive alongside the JSON answers field (plan §3/§7).
  app.post("/form-builder/submissions/create", authenticateToken, tenantMiddleware, formBuilderUpload, createSubmissionController);
  app.post("/form-builder/submissions/update", authenticateToken, tenantMiddleware, formBuilderUpload, updateSubmissionController);
  app.post("/form-builder/submissions/list", authenticateToken, tenantMiddleware, listSubmissionsController);
  app.post("/form-builder/submissions/get", authenticateToken, tenantMiddleware, getSubmissionController);
  app.post("/form-builder/submissions/delete", authenticateToken, tenantMiddleware, deleteSubmissionController);
  app.post("/form-builder/submissions/update-status", authenticateToken, tenantMiddleware, updateSubmissionStatusController);
  app.post("/form-builder/submissions/link-duplicate", authenticateToken, tenantMiddleware, linkDuplicateContactController);
  app.post("/form-builder/submissions/dismiss-duplicate", authenticateToken, tenantMiddleware, dismissDuplicateContactController);
  app.post("/form-builder/submissions/:id/audit-log", authenticateToken, tenantMiddleware, getSubmissionAuditLogController);
  app.post("/form-builder/submissions/export-pdf", authenticateToken, tenantMiddleware, exportSubmissionPdfEndpointController);
  app.post("/form-builder/submissions/export-bulk-pdf", authenticateToken, tenantMiddleware, exportSubmissionsBulkPdfController);
  app.post("/form-builder/submissions/export-excel", authenticateToken, tenantMiddleware, exportSubmissionsExcelController);
};
