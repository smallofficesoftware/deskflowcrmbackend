import { tallyGetSettingsProvider, tallySaveSettingsProvider } from "../../controllers/tally/tallyController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { requireAddon } from "../../middlewares/requireAddon.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

// First slice of the Tally marketplace addon (plans/2026-10-08-marketplace-
// tally-plan.txt). Every route is gated by requireAddon('tally') - the
// GENERIC primitive (src/middlewares/requireAddon.js), not a Tally-specific
// check. Mapping/sync/log routes land in P4/P5b; this is settings only.
export default (app) => {
  app.post("/tally/settings/get", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyGetSettingsProvider);
  app.post("/tally/settings/save", authenticateToken, tenantMiddleware, requireAddon("tally"), tallySaveSettingsProvider);
};
