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
  listFormPermissionsController,
  saveFormPermissionsController,
  formPermissionOptionsController,
  getFormAuditLogController,
  referenceOptionsController,
  previewAutoNumberController,
  listCustomListsController,
  getProductFillValuesController,
  saveCustomListController,
  deleteCustomListController,
  searchCustomersController,
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
  revealSensitiveFieldController,
  exportSubmissionPdfEndpointController,
  exportBlankFormPdfEndpointController,
  stageActionController,
  listTemplatesController,
  saveTemplateFromFormController,
  deleteTemplateController,
  exportSubmissionsBulkPdfController,
  exportSubmissionsExcelController,
  listSchedulesController,
  saveScheduleController,
  deleteScheduleController,
  listMyDueFormsController,
  scheduleReportController,
  getImportColumnsController,
  runImportController,
  saveDraftController,
  listDraftsController,
  getDraftController,
  deleteDraftController,
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
  app.post("/form-builder/auto-number-preview", authenticateToken, tenantMiddleware, previewAutoNumberController);
  app.post("/form-builder/custom-lists/list", authenticateToken, tenantMiddleware, listCustomListsController);
  app.post("/form-builder/product-fill-values", authenticateToken, tenantMiddleware, getProductFillValuesController);
  app.post("/form-builder/custom-lists/save", authenticateToken, tenantMiddleware, saveCustomListController);
  app.post("/form-builder/custom-lists/delete", authenticateToken, tenantMiddleware, deleteCustomListController);
  app.post("/form-builder/customer-search", authenticateToken, tenantMiddleware, searchCustomersController);
  app.post("/form-builder/:id/audit-log", authenticateToken, tenantMiddleware, getFormAuditLogController);
  app.post("/form-builder/:id/team-rights/list", authenticateToken, tenantMiddleware, listFormTeamRightsController);
  app.post("/form-builder/:id/team-rights", authenticateToken, tenantMiddleware, saveFormTeamRightsController);
  // Per-form permissions ("Permissions" tab — change dates, see masked
  // fields, ...). Build/edit access to the form required (service-side).
  app.post("/form-builder/permission-options", authenticateToken, tenantMiddleware, formPermissionOptionsController);
  app.post("/form-builder/:id/permissions/list", authenticateToken, tenantMiddleware, listFormPermissionsController);
  app.post("/form-builder/:id/permissions/save", authenticateToken, tenantMiddleware, saveFormPermissionsController);
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
  // Full number behind an encrypted Aadhaar field — form's "see_masked_fields"
  // permission (owner always), audit-logged
  // (service-side check, formBuilderSubmissionService.js revealSensitiveField).
  app.post("/form-builder/submissions/reveal-field", authenticateToken, tenantMiddleware, revealSensitiveFieldController);
  app.post("/form-builder/submissions/:id/audit-log", authenticateToken, tenantMiddleware, getSubmissionAuditLogController);
  app.post("/form-builder/submissions/export-pdf", authenticateToken, tenantMiddleware, exportSubmissionPdfEndpointController);
  app.post("/form-builder/export-blank-pdf", authenticateToken, tenantMiddleware, exportBlankFormPdfEndpointController);
  app.post("/form-builder/submissions/stage-action", authenticateToken, tenantMiddleware, stageActionController);
  app.post("/form-builder/templates/list", authenticateToken, tenantMiddleware, listTemplatesController);
  app.post("/form-builder/templates/save-from-form", authenticateToken, tenantMiddleware, saveTemplateFromFormController);
  app.post("/form-builder/templates/delete", authenticateToken, tenantMiddleware, deleteTemplateController);
  app.post("/form-builder/submissions/export-bulk-pdf", authenticateToken, tenantMiddleware, exportSubmissionsBulkPdfController);
  app.post("/form-builder/submissions/export-excel", authenticateToken, tenantMiddleware, exportSubmissionsExcelController);
  app.post("/form-builder/schedules/list", authenticateToken, tenantMiddleware, listSchedulesController);
  app.post("/form-builder/schedules/save", authenticateToken, tenantMiddleware, saveScheduleController);
  app.post("/form-builder/schedules/delete", authenticateToken, tenantMiddleware, deleteScheduleController);
  app.post("/form-builder/schedules/due", authenticateToken, tenantMiddleware, listMyDueFormsController);
  app.post("/form-builder/schedules/report", authenticateToken, tenantMiddleware, scheduleReportController);
  app.post("/form-builder/import/columns", authenticateToken, tenantMiddleware, getImportColumnsController);
  app.post("/form-builder/import/run", authenticateToken, tenantMiddleware, runImportController);
  app.post("/form-builder/drafts/save", authenticateToken, tenantMiddleware, saveDraftController);
  app.post("/form-builder/drafts/list", authenticateToken, tenantMiddleware, listDraftsController);
  app.post("/form-builder/drafts/get", authenticateToken, tenantMiddleware, getDraftController);
  app.post("/form-builder/drafts/delete", authenticateToken, tenantMiddleware, deleteDraftController);
};
