import {
  createReportDefinitionController,
  deleteReportDefinitionController,
  exportReportExcelController,
  exportReportPdfController,
  getModelRegistryController,
  getPluginRegistryController,
  listReportDefinitionsController,
  runBatchReportDefinitionsController,
  runReportDefinitionController,
  updateReportDefinitionController,
} from "../../controllers/report_builder/reportDefinitionController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { requireReportPin } from "../../middlewares/reportPinAuth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { isFeatureEnabled } from "../../services/company_setup/featureFlagServices.js";
import { getCompanyByLoginId } from "../../services/commonServices.js";
import { resError } from "../../utils/sharedFunctions.js";

// Gates the whole feature's existence for a company — unlike the pdfme
// document_designer flag (which only swaps a rendering path), Report
// Builder has no fallback path, so every route here (build AND run alike)
// checks it, before any report_definitions/whitelisted-table query runs.
const requireReportBuilderFlag = async (req, res, next) => {
  try {
    const { a_application_login_id } = req.body || {};
    if (!a_application_login_id) {
      return res.status(200).send(resError({ ack_msg: "a_application_login_id is required", developer_msg: "Missing a_application_login_id" }));
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return res.status(200).send(resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" }));
    }
    const enabled = await isFeatureEnabled(findCompanyId.company_masters_id, "report_builder");
    if (!enabled) {
      return res.status(200).send(resError({ ack_msg: "Report Builder is not enabled for this company", developer_msg: "company_feature_flags.report_builder is not set" }));
    }
    next();
  } catch (error) {
    console.error("requireReportBuilderFlag error:", error);
    return res.status(200).send(resError({ developer_msg: `Failed to Catch ${error}` }));
  }
};

export default (app) => {
  // Build routes — feature flag + owner+PIN gate.
  app.post("/report-definitions/model-registry", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, getModelRegistryController);
  app.post("/report-definitions/plugin-registry", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, getPluginRegistryController);
  app.post("/report-definitions/create", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, createReportDefinitionController);
  app.post("/report-definitions/list", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, listReportDefinitionsController);
  app.post("/report-definitions/:id/update", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, updateReportDefinitionController);
  app.post("/report-definitions/:id/delete", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, deleteReportDefinitionController);
  // Run routes — feature flag only, no PIN (anyone with normal rights can run/view a report someone else built).
  app.post("/report-definitions/:id/run", authenticateToken, tenantMiddleware, requireReportBuilderFlag, runReportDefinitionController);
  app.post("/report-definitions/run-batch", authenticateToken, tenantMiddleware, requireReportBuilderFlag, runBatchReportDefinitionsController);
  // Export routes — flag-only, same tier as /run (no PIN: anyone with
  // normal rights can export/print a report someone else built).
  app.post("/report-definitions/:id/export/excel", authenticateToken, tenantMiddleware, requireReportBuilderFlag, exportReportExcelController);
  app.post("/report-definitions/:id/export/pdf", authenticateToken, tenantMiddleware, requireReportBuilderFlag, exportReportPdfController);
};
