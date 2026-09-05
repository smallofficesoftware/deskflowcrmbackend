import {
  copyFromSystemReportDefinitionController,
  createReportDefinitionController,
  createReportGroupController,
  createReportScheduleController,
  deleteReportDefinitionController,
  deleteReportGroupController,
  deleteReportScheduleController,
  duplicateReportDefinitionController,
  exportReportDefinitionController,
  exportReportExcelController,
  exportReportPdfController,
  getGeneralFilterConfigController,
  getMetricsRegistryController,
  getModelRegistryController,
  getPluginRegistryController,
  getReportTeamRightsController,
  importReportDefinitionController,
  listReportDefinitionsController,
  listReportGroupsController,
  listReportSchedulesController,
  listRunnableReportDefinitionsController,
  listSystemReportDefinitionsController,
  previewReportDefinitionController,
  previewReportPdfController,
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

export default (app) => {
  // Build routes — owner+PIN gate (no company feature flag — Report
  // Builder is enabled for every company, gated only by rights/PIN).
  app.post("/report-definitions/model-registry", authenticateToken, tenantMiddleware, requireReportPin, getModelRegistryController);
  app.post("/report-definitions/plugin-registry", authenticateToken, tenantMiddleware, requireReportPin, getPluginRegistryController);
  app.post("/report-definitions/metrics-registry", authenticateToken, tenantMiddleware, requireReportPin, getMetricsRegistryController);
  app.post("/report-definitions/create", authenticateToken, tenantMiddleware, requireReportPin, createReportDefinitionController);
  // Live preview (Step 12 visual pass #3) — same build tier as create, runs
  // an in-progress/unsaved definition against this company's own data,
  // capped small (see previewReportDefinition's own comment).
  app.post("/report-definitions/preview", authenticateToken, tenantMiddleware, requireReportPin, previewReportDefinitionController);
  // Import — same tier as create (build action, needs the PIN); it's just
  // createReportDefinition fed from an uploaded file.
  app.post("/report-definitions/import", authenticateToken, tenantMiddleware, requireReportPin, importReportDefinitionController);
  app.post("/report-definitions/list", authenticateToken, tenantMiddleware, requireReportPin, listReportDefinitionsController);
  app.post("/report-definitions/:id/update", authenticateToken, tenantMiddleware, requireReportPin, updateReportDefinitionController);
  app.post("/report-definitions/:id/delete", authenticateToken, tenantMiddleware, requireReportPin, deleteReportDefinitionController);
  // Duplicate — same tier as create (build action, needs the PIN).
  app.post("/report-definitions/:id/duplicate", authenticateToken, tenantMiddleware, requireReportPin, duplicateReportDefinitionController);
  // System gallery — browsing the list needs no PIN (same tier Document
  // Designer's own system-gallery/list uses), copying into the tenant's own
  // report_definitions is a build action so it needs one, same as create.
  app.post("/report-definitions/system-gallery/list", authenticateToken, tenantMiddleware, listSystemReportDefinitionsController);
  app.post("/report-definitions/system-gallery/copy", authenticateToken, tenantMiddleware, requireReportPin, copyFromSystemReportDefinitionController);
  // Manage Access — build-tier gated like create/update/delete, both read and write.
  app.post("/report-definitions/:id/team-rights/list", authenticateToken, tenantMiddleware, requireReportPin, getReportTeamRightsController);
  app.post("/report-definitions/:id/team-rights", authenticateToken, tenantMiddleware, requireReportPin, saveReportTeamRightsController);
  // Discovery for "Custom Reports" — no PIN. Visibility itself
  // is enforced inside listRunnableReportDefinitions via
  // report_definition_team_rights (no page-level fallback — Step 7).
  app.post("/report-definitions/list-runnable", authenticateToken, tenantMiddleware, listRunnableReportDefinitionsController);
  // generalFilters slot map + column types for one model_key — no PIN,
  // same tier as list-runnable. Feeds CheckBoxFilterModal on the
  // run screen for any granted (or owner) login, not just the build UI.
  app.post("/report-definitions/general-filter-config", authenticateToken, tenantMiddleware, getGeneralFilterConfigController);
  // Run routes — the actual per-report
  // access check happens inside runDefinitionByType's dispatch via
  // getReportDataScope (report_definition_team_rights, Step 7) — a login
  // with no grant for this specific report gets denied there, not here.
  // query/composite check this inside their own engines
  // (runQueryReport/runCompositeReport); plugin-type checks it in
  // runDefinitionByType itself, since dispatch there is otherwise a
  // pass-through to the wrapped service's own (sometimes nonexistent)
  // rights behavior — see reportDefinitionServices.js's runDefinitionByType.
  app.post("/report-definitions/:id/run", authenticateToken, tenantMiddleware, runReportDefinitionController);
  app.post("/report-definitions/run-batch", authenticateToken, tenantMiddleware, runBatchReportDefinitionsController);
  // Export routes — same tier as /run; exportReportExcel/exportReportPdf
  // both dispatch through runDefinitionByType, so they inherit the exact
  // same per-report scope enforcement query/composite runs already get.
  app.post("/report-definitions/:id/export/excel", authenticateToken, tenantMiddleware, exportReportExcelController);
  app.post("/report-definitions/:id/export/pdf", authenticateToken, tenantMiddleware, exportReportPdfController);
  // Report Designer's "Generate Preview" — draft template, live report data,
  // base64 back (no file written) — same tier as the export routes above.
  app.post("/report-definitions/:id/preview-pdf", authenticateToken, tenantMiddleware, previewReportPdfController);
  // Export-as-JSON (backup/portability of the definition's own build shape,
  // not a data export) — same tier as the two above; reading
  // your own report's shape needs no PIN, only WRITING one (import) does.
  app.post("/report-definitions/:id/export-json", authenticateToken, tenantMiddleware, exportReportDefinitionController);

  // Admin authoring test-run (plan Step 1) — the ONE service-to-service
  // route in this router. Called only by adminpanel's own backend, never
  // a CRM client, so it deliberately skips authenticateToken/
  // tenantMiddleware entirely (there's no CRM
  // user session to check here — the target is
  // always WEBSITE_LEAD_HANDLE_DB_NAME, resolved inside the service
  // itself) and is gated only by requireServiceSecret, which fails closed
  // whenever REPORT_BUILDER_TEST_SECRET isn't configured.
  app.post("/report-definitions/test-run", requireServiceSecret, testRunReportDefinitionController);

  // Report groups (Step 10) — reading the list needs no PIN (group
  // names are organizational labels, same non-sensitive tier `category`/
  // `description` already sit at on list-runnable — the "Custom Reports"
  // tile section needs these to render bucket headers for every viewer,
  // not just the owner). Create/update/delete stay build-tier owner+PIN,
  // same as everything else that configures how reports are organized.
  app.post("/report-groups/list", authenticateToken, tenantMiddleware, listReportGroupsController);
  app.post("/report-groups/create", authenticateToken, tenantMiddleware, requireReportPin, createReportGroupController);
  app.post("/report-groups/:id/update", authenticateToken, tenantMiddleware, requireReportPin, updateReportGroupController);
  app.post("/report-groups/:id/delete", authenticateToken, tenantMiddleware, requireReportPin, deleteReportGroupController);

  // Schedules (Step 8a) — build-tier owner+PIN, same as everything else
  // that configures a report. :id below is report_definition_id (list/
  // create scoped to one report); :scheduleId (update/delete) is the
  // schedule's own id, since a report can have more than one schedule.
  app.post("/report-definitions/:id/schedules/list", authenticateToken, tenantMiddleware, requireReportPin, listReportSchedulesController);
  app.post("/report-definitions/:id/schedules/create", authenticateToken, tenantMiddleware, requireReportPin, createReportScheduleController);
  app.post("/report-schedules/:scheduleId/update", authenticateToken, tenantMiddleware, requireReportPin, updateReportScheduleController);
  app.post("/report-schedules/:scheduleId/delete", authenticateToken, tenantMiddleware, requireReportPin, deleteReportScheduleController);

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
