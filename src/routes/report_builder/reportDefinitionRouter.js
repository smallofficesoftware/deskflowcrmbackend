import {
  copyFromSystemReportDefinitionController,
  createReportDefinitionController,
  deleteReportDefinitionController,
  exportReportExcelController,
  exportReportPdfController,
  getGeneralFilterConfigController,
  getMetricsRegistryController,
  getModelRegistryController,
  getPluginRegistryController,
  getReportTeamRightsController,
  listReportDefinitionsController,
  listReportRunsController,
  listRunnableReportDefinitionsController,
  listSystemReportDefinitionsController,
  runBatchReportDefinitionsController,
  runReportDefinitionController,
  saveReportTeamRightsController,
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
  app.post("/report-definitions/metrics-registry", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, getMetricsRegistryController);
  app.post("/report-definitions/create", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, createReportDefinitionController);
  app.post("/report-definitions/list", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, listReportDefinitionsController);
  app.post("/report-definitions/:id/update", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, updateReportDefinitionController);
  app.post("/report-definitions/:id/delete", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, deleteReportDefinitionController);
  // System gallery — browsing the list needs no PIN (same tier Document
  // Designer's own system-gallery/list uses), copying into the tenant's own
  // report_definitions is a build action so it needs one, same as create.
  app.post("/report-definitions/system-gallery/list", authenticateToken, tenantMiddleware, requireReportBuilderFlag, listSystemReportDefinitionsController);
  app.post("/report-definitions/system-gallery/copy", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, copyFromSystemReportDefinitionController);
  // Manage Access — build-tier gated like create/update/delete, both read and write.
  app.post("/report-definitions/:id/team-rights/list", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, getReportTeamRightsController);
  app.post("/report-definitions/:id/team-rights", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, saveReportTeamRightsController);
  app.post("/report-definitions/:id/run-history/list", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, listReportRunsController);
  // Discovery for "Custom Reports" — flag only, no PIN. Visibility itself
  // is enforced inside listRunnableReportDefinitions via
  // report_definition_team_rights (no page-level fallback — Step 7).
  app.post("/report-definitions/list-runnable", authenticateToken, tenantMiddleware, requireReportBuilderFlag, listRunnableReportDefinitionsController);
  // generalFilters slot map + column types for one model_key — flag only,
  // no PIN, same tier as list-runnable. Feeds CheckBoxFilterModal on the
  // run screen for any granted (or owner) login, not just the build UI.
  app.post("/report-definitions/general-filter-config", authenticateToken, tenantMiddleware, requireReportBuilderFlag, getGeneralFilterConfigController);
  // Run routes — feature flag at the route layer; the actual per-report
  // access check now happens inside runQueryReport/runCompositeReport via
  // getReportDataScope (report_definition_team_rights, Step 7) — a login
  // with no grant for this specific report gets denied there, not here.
  // (Plugin-type definitions are the one exception: they keep obeying
  // their own wrapped service's existing rights behavior unchanged, same
  // "wrapping a plugin doesn't change its rights" rule createReportDefinition
  // already documents — this Step 7 system doesn't apply to them.)
  app.post("/report-definitions/:id/run", authenticateToken, tenantMiddleware, requireReportBuilderFlag, runReportDefinitionController);
  app.post("/report-definitions/run-batch", authenticateToken, tenantMiddleware, requireReportBuilderFlag, runBatchReportDefinitionsController);
  // Export routes — same tier as /run; exportReportExcel/exportReportPdf
  // both dispatch through runDefinitionByType, so they inherit the exact
  // same per-report scope enforcement query/composite runs already get.
  app.post("/report-definitions/:id/export/excel", authenticateToken, tenantMiddleware, requireReportBuilderFlag, exportReportExcelController);
  app.post("/report-definitions/:id/export/pdf", authenticateToken, tenantMiddleware, requireReportBuilderFlag, exportReportPdfController);
};
