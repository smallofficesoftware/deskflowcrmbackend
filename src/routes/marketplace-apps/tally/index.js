import { tallyGetSettingsProvider, tallySaveSettingsProvider } from "../../../controllers/tally/tallyController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { requireAddon } from "../../../middlewares/requireAddon.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

// First slice of the Tally marketplace addon (plans/2026-10-08-marketplace-
// tally-plan.txt). Every route is gated by requireAddon('tally') - the
// GENERIC primitive (src/middlewares/requireAddon.js), not a Tally-specific
// check. Mapping/sync/log routes land in P4/P5b; this is settings only.
// Moved here (from src/routes/tally/tallyRoutes.js) to prove the marketplace-
// apps dynamic loader (../marketplaceAppsLoader.js) actually works against a
// real app, not just a stub - every app under src/routes/marketplace-apps/<code>/
// gets auto-mounted with zero indexRouter.js edit, this file's own export
// shape (default (app) => {...}) is unchanged from every other router in the
// codebase, only WHERE it lives changed.
export default (app) => {
  app.post("/tally/settings/get", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyGetSettingsProvider);
  app.post("/tally/settings/save", authenticateToken, tenantMiddleware, requireAddon("tally"), tallySaveSettingsProvider);
};
