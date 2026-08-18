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
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/document-templates/list", authenticateToken, tenantMiddleware, listDocumentTemplatesController);
  app.post("/document-templates/get", authenticateToken, tenantMiddleware, getDocumentTemplateController);
  app.post("/document-templates/create", authenticateToken, tenantMiddleware, createDocumentTemplateController);
  app.post("/document-templates/update", authenticateToken, tenantMiddleware, updateDocumentTemplateController);
  app.post("/document-templates/apply-options", authenticateToken, tenantMiddleware, applyOptionsToDraftController);
  app.post("/document-templates/publish", authenticateToken, tenantMiddleware, publishDocumentTemplateController);
  app.post("/document-templates/discard-draft", authenticateToken, tenantMiddleware, discardDraftChangesController);
  app.post("/document-templates/reorder", authenticateToken, tenantMiddleware, reorderDocumentTemplatesController);
  app.post("/document-templates/set-default", authenticateToken, tenantMiddleware, setDefaultDocumentTemplateController);
  app.post("/document-templates/delete", authenticateToken, tenantMiddleware, deleteDocumentTemplateController);
  app.post("/document-templates/duplicate", authenticateToken, tenantMiddleware, duplicateDocumentTemplateController);
  app.post("/document-templates/export", authenticateToken, tenantMiddleware, exportDocumentTemplateController);
  app.post("/document-templates/import", authenticateToken, tenantMiddleware, importDocumentTemplateController);
  app.post("/document-templates/versions/list", authenticateToken, tenantMiddleware, listTemplateVersionsController);
  app.post("/document-templates/versions/restore", authenticateToken, tenantMiddleware, restoreTemplateVersionController);
  app.post("/document-templates/system-gallery/list", authenticateToken, tenantMiddleware, listSystemTemplatesController);
  app.post("/document-templates/system-gallery/copy", authenticateToken, tenantMiddleware, copyFromSystemTemplateController);
  app.post("/document-templates/data-dictionary", authenticateToken, tenantMiddleware, dataDictionaryController);
  app.post("/document-templates/preview", authenticateToken, tenantMiddleware, previewDocumentTemplateController);
};
