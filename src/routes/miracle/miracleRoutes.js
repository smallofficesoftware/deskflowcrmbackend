import { bulkSyncMiracleModulesProvider, createMiracleConfig, fetchContactProvider, fetchProductProvider, generateLedgerProvider, generateMiracleTokenProvider, generateOutstandingProvider, getAccountLedger, getMiracleConfig, getMiracleUnsyncedCountsProvider, processContactProvider, processProductProvider, syncCaseBankPrProvider, syncInvoiceProvider, syncProductProvider, webhookProvider } from "../../controllers/miracle/miracleControlles.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { checkMiracleAuth } from "../../middlewares/miracleAuth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/sync-product", authenticateToken, tenantMiddleware, checkMiracleAuth, syncProductProvider);
    app.post("/sync-invoice", authenticateToken, tenantMiddleware, checkMiracleAuth, syncInvoiceProvider);
    app.post("/sync-case-bank-pr", authenticateToken, tenantMiddleware, checkMiracleAuth, syncCaseBankPrProvider);
    app.post("/generate-ledger", authenticateToken, tenantMiddleware, checkMiracleAuth, generateLedgerProvider);
    app.post("/generate-outstanding", authenticateToken, tenantMiddleware, checkMiracleAuth, generateOutstandingProvider);
    app.post("/webhookmiracle/:companyCode", webhookProvider);
    app.post("/create-miracle-config", authenticateToken, tenantMiddleware, createMiracleConfig);
    app.post("/get-miracle-config", authenticateToken, tenantMiddleware, getMiracleConfig);
    app.post("/get-miracle-account-ledger", authenticateToken, tenantMiddleware, checkMiracleAuth, getAccountLedger);
    app.post("/product-sync/preview", authenticateToken, tenantMiddleware, checkMiracleAuth, fetchProductProvider);
    app.post("/product-sync/process", authenticateToken, tenantMiddleware, checkMiracleAuth, processProductProvider);
    app.post("/contact-sync/preview", authenticateToken, tenantMiddleware, checkMiracleAuth, fetchContactProvider);
    app.post("/contact-sync/process", authenticateToken, tenantMiddleware, checkMiracleAuth, processContactProvider);
    app.post("/generate-miracle-token", authenticateToken, tenantMiddleware, checkMiracleAuth, generateMiracleTokenProvider);
    app.post("/get-miracle-unsynced-counts", authenticateToken, tenantMiddleware, getMiracleUnsyncedCountsProvider);
    app.post("/bulk-sync-miracle-modules", authenticateToken, tenantMiddleware, checkMiracleAuth, bulkSyncMiracleModulesProvider);
};