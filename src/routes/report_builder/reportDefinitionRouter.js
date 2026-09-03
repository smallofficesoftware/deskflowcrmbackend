import {
  copyFromSystemReportDefinitionController,
  createReportDefinitionController,
  createReportGroupController,
  createReportScheduleController,
  deleteReportDefinitionController,
  deleteReportGroupController,
  deleteReportScheduleController,
  duplicateReportDefinitionController,
  exportReportExcelController,
  exportReportPdfController,
  getGeneralFilterConfigController,
  getMetricsRegistryController,
  getModelRegistryController,
  getPluginRegistryController,
  getReportTeamRightsController,
  listReportDefinitionsController,
  listReportGroupsController,
  listReportRunsController,
  listReportSchedulesController,
  listRunnableReportDefinitionsController,
  listSystemReportDefinitionsController,
  reportScheduleDispatchCroneTabController,
  runBatchReportDefinitionsController,
  runReportDefinitionController,
  saveReportTeamRightsController,
  testRunReportDefinitionController,
  updateReportDefinitionController,
  updateReportGroupController,
  updateReportScheduleController,
} from "../../controllers/report_builder/reportDefinitionController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { requireReportPin, requireServiceSecret } from "../../middlewares/reportPinAuth.js";
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
  // Duplicate — same tier as create (build action, needs the PIN).
  app.post("/report-definitions/:id/duplicate", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, duplicateReportDefinitionController);
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
  // access check now happens inside runDefinitionByType's dispatch via
  // getReportDataScope (report_definition_team_rights, Step 7) — a login
  // with no grant for this specific report gets denied there, not here.
  // query/composite check this inside their own engines
  // (runQueryReport/runCompositeReport); plugin-type checks it in
  // runDefinitionByType itself, since dispatch there is otherwise a
  // pass-through to the wrapped service's own (sometimes nonexistent)
  // rights behavior — see reportDefinitionServices.js's runDefinitionByType.
  app.post("/report-definitions/:id/run", authenticateToken, tenantMiddleware, requireReportBuilderFlag, runReportDefinitionController);
  app.post("/report-definitions/run-batch", authenticateToken, tenantMiddleware, requireReportBuilderFlag, runBatchReportDefinitionsController);
  // Export routes — same tier as /run; exportReportExcel/exportReportPdf
  // both dispatch through runDefinitionByType, so they inherit the exact
  // same per-report scope enforcement query/composite runs already get.
  app.post("/report-definitions/:id/export/excel", authenticateToken, tenantMiddleware, requireReportBuilderFlag, exportReportExcelController);
  app.post("/report-definitions/:id/export/pdf", authenticateToken, tenantMiddleware, requireReportBuilderFlag, exportReportPdfController);

  // Admin authoring test-run (plan Step 1) — the ONE service-to-service
  // route in this router. Called only by adminpanel's own backend, never
  // a CRM client, so it deliberately skips authenticateToken/
  // tenantMiddleware/requireReportBuilderFlag entirely (there's no CRM
  // user session or company feature flag to check here — the target is
  // always WEBSITE_LEAD_HANDLE_DB_NAME, resolved inside the service
  // itself) and is gated only by requireServiceSecret, which fails closed
  // whenever REPORT_BUILDER_TEST_SECRET isn't configured.
  app.post("/report-definitions/test-run", requireServiceSecret, testRunReportDefinitionController);

  // Report groups (Step 10) — reading the list is flag-only/no-PIN (group
  // names are organizational labels, same non-sensitive tier `category`/
  // `description` already sit at on list-runnable — the "Custom Reports"
  // tile section needs these to render bucket headers for every viewer,
  // not just the owner). Create/update/delete stay build-tier owner+PIN,
  // same as everything else that configures how reports are organized.
  app.post("/report-groups/list", authenticateToken, tenantMiddleware, requireReportBuilderFlag, listReportGroupsController);
  app.post("/report-groups/create", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, createReportGroupController);
  app.post("/report-groups/:id/update", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, updateReportGroupController);
  app.post("/report-groups/:id/delete", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, deleteReportGroupController);

  // Schedules (Step 8a) — build-tier owner+PIN, same as everything else
  // that configures a report. :id below is report_definition_id (list/
  // create scoped to one report); :scheduleId (update/delete) is the
  // schedule's own id, since a report can have more than one schedule.
  app.post("/report-definitions/:id/schedules/list", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, listReportSchedulesController);
  app.post("/report-definitions/:id/schedules/create", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, createReportScheduleController);
  app.post("/report-schedules/:scheduleId/update", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, updateReportScheduleController);
  app.post("/report-schedules/:scheduleId/delete", authenticateToken, tenantMiddleware, requireReportBuilderFlag, requireReportPin, deleteReportScheduleController);

  // External-cron dispatch entry point (Step 8a) — same shape as every
  // other *CroneTabRunner in cronJobsRouter.js: no authenticateToken/
  // tenantMiddleware here (there's no CRM user session — the caller is
  // an external cron tab, and tenantMiddleware runs once per tenant
  // INSIDE the runner itself, not at the route layer). Inert by default:
  // gated by EXTERNAL_CRONE_RUNNING_FLAG + a cron_jobs kill-switch row,
  // both requiring deliberate action outside this codebase before this
  // endpoint does anything even if called.
  app.post("/report-schedule-dispatch-crone-tab/:offset/:limit", reportScheduleDispatchCroneTabController);
};
