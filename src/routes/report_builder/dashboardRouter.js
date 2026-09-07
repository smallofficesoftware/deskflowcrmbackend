import {
  addQuickCounterWidgetController,
  addWidgetController,
  copyFromSystemDashboardDefinitionController,
  createDashboardController,
  deleteDashboardController,
  deleteWidgetController,
  duplicateDashboardController,
  getDashboardController,
  listDashboardsController,
  listSystemDashboardDefinitionsController,
  reorderDashboardsController,
  runDashboardController,
  setDefaultDashboardController,
  updateDashboardController,
  updateWidgetController,
  updateWidgetPositionsController,
} from "../../controllers/report_builder/dashboardController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  // No company feature flag, no owner+PIN gate — Dashboard is enabled for
  // every company, every route here is just authenticateToken +
  // tenantMiddleware, same as Report Builder.
  app.post("/dashboards/create", authenticateToken, tenantMiddleware, createDashboardController);
  app.post("/dashboards/:id/update", authenticateToken, tenantMiddleware, updateDashboardController);
  app.post("/dashboards/:id/delete", authenticateToken, tenantMiddleware, deleteDashboardController);
  app.post("/dashboards/reorder", authenticateToken, tenantMiddleware, reorderDashboardsController);
  app.post("/dashboards/:id/set-default", authenticateToken, tenantMiddleware, setDefaultDashboardController);
  app.post("/dashboards/:id/duplicate", authenticateToken, tenantMiddleware, duplicateDashboardController);

  // Widget CRUD — same build tier as the dashboard routes above.
  app.post("/dashboards/:id/widgets/create", authenticateToken, tenantMiddleware, addWidgetController);
  // "Quick counter" shortcut — model_key + column + aggregate, no Report
  // Builder wizard trip. Same build tier (still creates a real report row).
  app.post("/dashboards/:id/widgets/quick-counter", authenticateToken, tenantMiddleware, addQuickCounterWidgetController);
  app.post("/dashboards/widgets/:id/update", authenticateToken, tenantMiddleware, updateWidgetController);
  app.post("/dashboards/widgets/:id/delete", authenticateToken, tenantMiddleware, deleteWidgetController);
  // Batch position/size (grid-layout drag session) — same tier, still a
  // build/edit action even though it's not a full CRUD verb.
  app.post("/dashboards/:id/widgets/positions", authenticateToken, tenantMiddleware, updateWidgetPositionsController);

  app.post("/dashboards/list", authenticateToken, tenantMiddleware, listDashboardsController);
  app.post("/dashboards/:id", authenticateToken, tenantMiddleware, getDashboardController);
  app.post("/dashboards/:id/run", authenticateToken, tenantMiddleware, runDashboardController);

  // System gallery (Phase 5) — browsing needs no PIN (same tier
  // Document Designer/Report Builder's own system-gallery/list use);
  // copying into the tenant's own dashboards is a build action.
  app.post("/dashboards/system-gallery/list", authenticateToken, tenantMiddleware, listSystemDashboardDefinitionsController);
  app.post("/dashboards/system-gallery/copy", authenticateToken, tenantMiddleware, copyFromSystemDashboardDefinitionController);
};
