import { getAppStatusController } from "../../controllers/apps/appsController.js";

// Generic, PUBLIC (no authenticateToken/tenantMiddleware) app-store status check -
// plans/2026-10-15-ecommerce-b2b-b2c-plan.txt (4.5), plans/2026-10-08-marketplace-
// tally-plan.txt (4.1). Called by the storefront app (storefront/src/lib/apps.ts's
// isAppEnabled stub) before any customer session exists, so it can't go through the
// authenticated tenantMiddleware flow requireAddon() otherwise assumes - it resolves
// its own tenant DB from the public `company` (qr_code) query param instead, the
// same way the existing online-store public endpoints do.
export default (app) => {
  app.get("/apps/:appCode/status", getAppStatusController);
};
