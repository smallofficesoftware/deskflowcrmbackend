import { tallyGetSettingsProvider, tallySaveSettingsProvider } from "../../../controllers/tally/tallyController.js";
import { tallyListContactMappingsProvider, tallySaveContactMappingProvider } from "../../../controllers/tally/tallyContactMappingController.js";
import { tallyListGstLedgerMappingsProvider, tallySaveGstLedgerMappingProvider } from "../../../controllers/tally/tallyGstLedgerMappingController.js";
import { tallyListProductMappingsProvider, tallySaveProductMappingProvider } from "../../../controllers/tally/tallyMappingController.js";
import { tallyListVoucherTypeMappingsProvider, tallySaveVoucherTypeMappingProvider } from "../../../controllers/tally/tallyVoucherTypeMappingController.js";
import {
  tallyConnectorDownloadProvider,
  tallyConnectorInfoProvider,
  tallyConnectorUpdateDownloadProvider,
  tallyConnectorUpdateInfoProvider,
  tallyGetNextJobProvider,
  tallyIssueConnectorKeyProvider,
  tallyPostJobResultProvider,
  tallyRevokeConnectorKeyProvider,
} from "../../../controllers/tally/tallyConnectorController.js";
import { tallyPullStatusProvider, tallyRequestPullProvider, tallySyncLogProvider } from "../../../controllers/tally/tallySyncController.js";
import {
  tallyDocumentsProvider,
  tallyListPaymentModeMappingsProvider,
  tallySavePaymentModeMappingProvider,
  tallySendProvider,
} from "../../../controllers/tally/tallyVoucherController.js";
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

  // Pull requests + sync log for the settings screen - user-session gated. The
  // jobs themselves are picked up by the connector via the routes further down.
  app.post("/tally/sync/request-pull", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyRequestPullProvider);
  app.post("/tally/sync/pull-status", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyPullStatusProvider);
  app.post("/tally/sync/log", authenticateToken, tenantMiddleware, requireAddon("tally"), tallySyncLogProvider);

  // Sending sales invoices and receipts to Tally (manual path; the auto-sync job queues the same way).
  app.post("/tally/sync/documents", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyDocumentsProvider);
  app.post("/tally/sync/send", authenticateToken, tenantMiddleware, requireAddon("tally"), tallySendProvider);
  app.post("/tally/mappings/payment-modes/get", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyListPaymentModeMappingsProvider);
  app.post("/tally/mappings/payment-modes/save", authenticateToken, tenantMiddleware, requireAddon("tally"), tallySavePaymentModeMappingProvider);

  // Connector key lifecycle - user-session gated (the CRM web app's Tally
  // settings screen), NOT connector-key gated.
  // The connector installer itself (what to download, and the values its config file needs).
  app.post("/tally/connector/download-info", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyConnectorInfoProvider);
  app.post("/tally/connector/download", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyConnectorDownloadProvider);

  app.post("/tally/connector-key/issue", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyIssueConnectorKeyProvider);
  app.post("/tally/connector-key/revoke", authenticateToken, tenantMiddleware, requireAddon("tally"), tallyRevokeConnectorKeyProvider);

  // Job queue - the connector itself calls these, with NO user session at all.
  // tenantMiddleware resolves company from companyCode in the body (no JWT,
  // same tokenless path Miracle's webhook uses); checkConnectorKey is this
  // addon's own gate in place of requireAddon, since there is no req.user.
  app.post("/tally/connector/jobs/next", tenantMiddleware, checkConnectorKey("tally"), tallyGetNextJobProvider);
  app.post("/tally/connector/jobs/result", tenantMiddleware, checkConnectorKey("tally"), tallyPostJobResultProvider);
  // Self-update: the installed connector asks for the latest version and downloads it (connector key, no user session).
  app.post("/tally/connector/version", tenantMiddleware, checkConnectorKey("tally"), tallyConnectorUpdateInfoProvider);
  app.post("/tally/connector/update", tenantMiddleware, checkConnectorKey("tally"), tallyConnectorUpdateDownloadProvider);

  // Connector-key-gated mirror of the mapping endpoints above (Q6: "Connector
  // local UI and CRM web UI both read/write tally_mappings through the same
  // API"). Same controllers/services as the user-session routes - each
  // service resolves company_masters_id via resolveCompanyId(), which checks
  // req.user?.companyId OR req.connectorKeyRow?.company_masters_id, so no
  // duplicated logic, just a different auth chain reaching the same code.
  app.post("/tally/connector/mappings/products/get", tenantMiddleware, checkConnectorKey("tally"), tallyListProductMappingsProvider);
  app.post("/tally/connector/mappings/products/save", tenantMiddleware, checkConnectorKey("tally"), tallySaveProductMappingProvider);
  app.post("/tally/connector/mappings/contacts/get", tenantMiddleware, checkConnectorKey("tally"), tallyListContactMappingsProvider);
  app.post("/tally/connector/mappings/contacts/save", tenantMiddleware, checkConnectorKey("tally"), tallySaveContactMappingProvider);
  app.post("/tally/connector/mappings/voucher-types/get", tenantMiddleware, checkConnectorKey("tally"), tallyListVoucherTypeMappingsProvider);
  app.post("/tally/connector/mappings/voucher-types/save", tenantMiddleware, checkConnectorKey("tally"), tallySaveVoucherTypeMappingProvider);
  app.post("/tally/connector/mappings/gst-ledgers/get", tenantMiddleware, checkConnectorKey("tally"), tallyListGstLedgerMappingsProvider);
  app.post("/tally/connector/mappings/gst-ledgers/save", tenantMiddleware, checkConnectorKey("tally"), tallySaveGstLedgerMappingProvider);
};
