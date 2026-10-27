import { tallyGetSettingsProvider, tallySaveSettingsProvider } from "../../../controllers/tally/tallyController.js";
import { tallyListContactMappingsProvider, tallySaveContactMappingProvider } from "../../../controllers/tally/tallyContactMappingController.js";
import { tallyListGstLedgerMappingsProvider, tallySaveGstLedgerMappingProvider } from "../../../controllers/tally/tallyGstLedgerMappingController.js";
import { tallyListProductMappingsProvider, tallySaveProductMappingProvider } from "../../../controllers/tally/tallyMappingController.js";
import { tallyListVoucherTypeMappingsProvider, tallySaveVoucherTypeMappingProvider } from "../../../controllers/tally/tallyVoucherTypeMappingController.js";
import { tallyGetNextJobProvider, tallyIssueConnectorKeyProvider, tallyPostJobResultProvider, tallyRevokeConnectorKeyProvider } from "../../../controllers/tally/tallyConnectorController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { checkConnectorKey } from "../../../middlewares/checkConnectorKey.js";
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
  app.post("/tally/mappings/products/get", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyListProductMappingsProvider);
  app.post("/tally/mappings/products/save", authenticateToken, tenantMiddleware, requireAddon("tally"), tallySaveProductMappingProvider);
  app.post("/tally/mappings/contacts/get", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyListContactMappingsProvider);
  app.post("/tally/mappings/contacts/save", authenticateToken, tenantMiddleware, requireAddon("tally"), tallySaveContactMappingProvider);
  app.post("/tally/mappings/voucher-types/get", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyListVoucherTypeMappingsProvider);
  app.post("/tally/mappings/voucher-types/save", authenticateToken, tenantMiddleware, requireAddon("tally"), tallySaveVoucherTypeMappingProvider);
  app.post("/tally/mappings/gst-ledgers/get", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyListGstLedgerMappingsProvider);
  app.post("/tally/mappings/gst-ledgers/save", authenticateToken, tenantMiddleware, requireAddon("tally"), tallySaveGstLedgerMappingProvider);

  // Connector key lifecycle - user-session gated (the CRM web app's Tally
  // settings screen), NOT connector-key gated.
  app.post("/tally/connector-key/issue", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyIssueConnectorKeyProvider);
  app.post("/tally/connector-key/revoke", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyRevokeConnectorKeyProvider);

  // Job queue - the connector itself calls these, with NO user session at all.
  // tenantMiddleware resolves company from companyCode in the body (no JWT,
  // same tokenless path Miracle's webhook uses); checkConnectorKey is this
  // addon's own gate in place of requireAddon, since there is no req.user.
  app.post("/tally/connector/jobs/next", tenantMiddleware, checkConnectorKey("tally"), tallyGetNextJobProvider);
  app.post("/tally/connector/jobs/result", tenantMiddleware, checkConnectorKey("tally"), tallyPostJobResultProvider);
};
