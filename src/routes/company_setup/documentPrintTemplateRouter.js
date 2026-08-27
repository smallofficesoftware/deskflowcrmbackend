import {
  applyOptionsToDraftController,
  copyFromSystemTemplateController,
  createDocumentTemplateController,
  dataDictionaryController,
  deleteDocumentTemplateController,
  discardDraftChangesController,
  duplicateDocumentTemplateController,
  exportDocumentTemplateController,
  getDocumentTemplateController,
  importDocumentTemplateController,
  listAllDocumentTemplatesController,
  listDocumentTemplatesController,
  listSystemTemplatesController,
  listTemplateVersionsController,
  previewDocumentTemplateController,
  publishDocumentTemplateController,
  reorderDocumentTemplatesController,
  restoreTemplateVersionController,
  setDefaultDocumentTemplateController,
  updateDocumentTemplateController,
} from "../../controllers/company_setup/documentPrintTemplateController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { requireReportPin } from "../../middlewares/reportPinAuth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/document-templates/list", authenticateToken, tenantMiddleware, listDocumentTemplatesController);
  app.post("/document-templates/list-all", authenticateToken, tenantMiddleware, listAllDocumentTemplatesController);
  app.post("/document-templates/get", authenticateToken, tenantMiddleware, getDocumentTemplateController);
  // Build/author routes below — owner+PIN gated (requireReportPin, shared
  // with Report Builder's build routes: src/middlewares/reportPinAuth.js).
  // Added retroactively — this router previously had no PIN gate at all.
  app.post("/document-templates/create", authenticateToken, tenantMiddleware, requireReportPin, createDocumentTemplateController);
  app.post("/document-templates/update", authenticateToken, tenantMiddleware, requireReportPin, updateDocumentTemplateController);
  app.post("/document-templates/apply-options", authenticateToken, tenantMiddleware, requireReportPin, applyOptionsToDraftController);
  app.post("/document-templates/publish", authenticateToken, tenantMiddleware, requireReportPin, publishDocumentTemplateController);
  app.post("/document-templates/discard-draft", authenticateToken, tenantMiddleware, requireReportPin, discardDraftChangesController);
  app.post("/document-templates/reorder", authenticateToken, tenantMiddleware, requireReportPin, reorderDocumentTemplatesController);
  app.post("/document-templates/set-default", authenticateToken, tenantMiddleware, requireReportPin, setDefaultDocumentTemplateController);
  app.post("/document-templates/delete", authenticateToken, tenantMiddleware, requireReportPin, deleteDocumentTemplateController);
  app.post("/document-templates/duplicate", authenticateToken, tenantMiddleware, requireReportPin, duplicateDocumentTemplateController);
  app.post("/document-templates/export", authenticateToken, tenantMiddleware, exportDocumentTemplateController);
  app.post("/document-templates/import", authenticateToken, tenantMiddleware, requireReportPin, importDocumentTemplateController);
  app.post("/document-templates/versions/list", authenticateToken, tenantMiddleware, listTemplateVersionsController);
  app.post("/document-templates/versions/restore", authenticateToken, tenantMiddleware, restoreTemplateVersionController);
  app.post("/document-templates/system-gallery/list", authenticateToken, tenantMiddleware, listSystemTemplatesController);
  app.post("/document-templates/system-gallery/copy", authenticateToken, tenantMiddleware, requireReportPin, copyFromSystemTemplateController);
  app.post("/document-templates/data-dictionary", authenticateToken, tenantMiddleware, dataDictionaryController);
  app.post("/document-templates/preview", authenticateToken, tenantMiddleware, previewDocumentTemplateController);
};
