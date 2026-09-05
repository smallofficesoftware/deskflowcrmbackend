import {
  addWidgetController,
  createDashboardController,
  deleteDashboardController,
  deleteWidgetController,
  duplicateDashboardController,
  getDashboardController,
  listDashboardsController,
  reorderDashboardsController,
  runDashboardController,
  setDefaultDashboardController,
  updateDashboardController,
  updateWidgetController,
  updateWidgetPositionsController,
} from "../../controllers/report_builder/dashboardController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { requireReportPin } from "../../middlewares/reportPinAuth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { isFeatureEnabled } from "../../services/company_setup/featureFlagServices.js";
import { getCompanyByLoginId } from "../../services/commonServices.js";
import { resError } from "../../utils/sharedFunctions.js";

// Independent of requireReportBuilderFlag (reportDefinitionRouter.js) — a
// company can be granted Dashboard without Report Builder, or vice versa
// (see PAGE_ID.DASHBOARD_BUILDER / feature_key "dashboard_builder", Phase 1).
// Every route here checks it, build AND run alike, same reasoning
// requireReportBuilderFlag's own comment gives for its feature.
const requireDashboardBuilderFlag = async (req, res, next) => {
  try {
    const { a_application_login_id } = req.body || {};
    if (!a_application_login_id) {
      return res.status(200).send(resError({ ack_msg: "a_application_login_id is required", developer_msg: "Missing a_application_login_id" }));
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return res.status(200).send(resError({ ack_msg: "Company not found for login ID", developer_msg: "No company associated with the provided login ID" }));
    }
    const enabled = await isFeatureEnabled(findCompanyId.company_masters_id, "dashboard_builder");
    if (!enabled) {
      return res.status(200).send(resError({ ack_msg: "Dashboard is not enabled for this company", developer_msg: "company_feature_flags.dashboard_builder is not set" }));
    }
    next();
  } catch (error) {
    console.error("requireDashboardBuilderFlag error:", error);
    return res.status(200).send(resError({ developer_msg: `Failed to Catch ${error}` }));
  }
};

export default (app) => {
  // Build routes — feature flag + owner+PIN gate, same tier as report_definitions' own create/update/delete.
  app.post("/dashboards/create", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, requireReportPin, createDashboardController);
  app.post("/dashboards/:id/update", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, requireReportPin, updateDashboardController);
  app.post("/dashboards/:id/delete", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, requireReportPin, deleteDashboardController);
  app.post("/dashboards/reorder", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, requireReportPin, reorderDashboardsController);
  app.post("/dashboards/:id/set-default", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, requireReportPin, setDefaultDashboardController);
  app.post("/dashboards/:id/duplicate", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, requireReportPin, duplicateDashboardController);

  // Widget CRUD — same build tier as the dashboard routes above.
  app.post("/dashboards/:id/widgets/create", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, requireReportPin, addWidgetController);
  app.post("/dashboards/widgets/:id/update", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, requireReportPin, updateWidgetController);
  app.post("/dashboards/widgets/:id/delete", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, requireReportPin, deleteWidgetController);
  // Batch position/size (grid-layout drag session) — same tier, still a
  // build/edit action even though it's not a full CRUD verb.
  app.post("/dashboards/:id/widgets/positions", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, requireReportPin, updateWidgetPositionsController);

  // Read/run routes — feature flag only, no PIN (same tier report_definitions'
  // own list/run routes use — viewing/running isn't a build action).
  app.post("/dashboards/list", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, listDashboardsController);
  app.post("/dashboards/:id", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, getDashboardController);
  app.post("/dashboards/:id/run", authenticateToken, tenantMiddleware, requireDashboardBuilderFlag, runDashboardController);
};
