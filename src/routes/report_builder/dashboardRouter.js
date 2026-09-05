import {
  addQuickCounterWidgetController,
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

export default (app) => {
  // Build routes — owner+PIN gate (no company feature flag — Dashboard is
  // enabled for every company, gated only by rights/PIN, same as Report
  // Builder).
  app.post("/dashboards/create", authenticateToken, tenantMiddleware, requireReportPin, createDashboardController);
  app.post("/dashboards/:id/update", authenticateToken, tenantMiddleware, requireReportPin, updateDashboardController);
  app.post("/dashboards/:id/delete", authenticateToken, tenantMiddleware, requireReportPin, deleteDashboardController);
  app.post("/dashboards/reorder", authenticateToken, tenantMiddleware, requireReportPin, reorderDashboardsController);
  app.post("/dashboards/:id/set-default", authenticateToken, tenantMiddleware, requireReportPin, setDefaultDashboardController);
  app.post("/dashboards/:id/duplicate", authenticateToken, tenantMiddleware, requireReportPin, duplicateDashboardController);

  // Widget CRUD — same build tier as the dashboard routes above.
  app.post("/dashboards/:id/widgets/create", authenticateToken, tenantMiddleware, requireReportPin, addWidgetController);
  // "Quick counter" shortcut — model_key + column + aggregate, no Report
  // Builder wizard trip. Same build tier (still creates a real report row).
  app.post("/dashboards/:id/widgets/quick-counter", authenticateToken, tenantMiddleware, requireReportPin, addQuickCounterWidgetController);
  app.post("/dashboards/widgets/:id/update", authenticateToken, tenantMiddleware, requireReportPin, updateWidgetController);
  app.post("/dashboards/widgets/:id/delete", authenticateToken, tenantMiddleware, requireReportPin, deleteWidgetController);
  // Batch position/size (grid-layout drag session) — same tier, still a
  // build/edit action even though it's not a full CRUD verb.
  app.post("/dashboards/:id/widgets/positions", authenticateToken, tenantMiddleware, requireReportPin, updateWidgetPositionsController);

  // Read/run routes — no PIN (same tier report_definitions' own list/run
  // routes use — viewing/running isn't a build action).
  app.post("/dashboards/list", authenticateToken, tenantMiddleware, listDashboardsController);
  app.post("/dashboards/:id", authenticateToken, tenantMiddleware, getDashboardController);
  app.post("/dashboards/:id/run", authenticateToken, tenantMiddleware, runDashboardController);
};
