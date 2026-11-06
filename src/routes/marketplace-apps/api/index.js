import {
  apiAccessCategoriesProvider,
  apiAccessIssueKeyProvider,
  apiAccessProductGroupsProvider,
  apiAccessProductsProvider,
  apiAccessRevokeKeyProvider,
  apiAccessStatusProvider,
  apiAccessTokenProvider,
} from "../../../controllers/api-access/apiAccessController.js";
import { apiAccessIpsGetProvider, apiAccessIpsSaveProvider } from "../../../controllers/api-access/apiAccessIpController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { requireAddon } from "../../../middlewares/requireAddon.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

// "API" marketplace addon: a company generates an API key, exchanges it for a short-lived JWT, and calls the
// existing product APIs (plus the combined listing below) with that JWT. Mounted automatically by
// marketplaceAppsLoader.js. The JWT is confined to an allow-list of product routes by middlewares/apiScopeGate.js.
export default (app) => {
  // CRM staff (settings screen) - user session + addon gate.
  app.post("/api-access/status", authenticateToken, tenantMiddleware, requireAddon("api"), apiAccessStatusProvider);
  app.post("/api-access/key/issue", authenticateToken, tenantMiddleware, requireAddon("api"), apiAccessIssueKeyProvider);
  app.post("/api-access/key/revoke", authenticateToken, tenantMiddleware, requireAddon("api"), apiAccessRevokeKeyProvider);

  // IP allow-list (one list per company; empty = every API call is blocked).
  app.post("/api-access/ips/get", authenticateToken, tenantMiddleware, requireAddon("api"), apiAccessIpsGetProvider);
  app.post("/api-access/ips/save", authenticateToken, tenantMiddleware, requireAddon("api"), apiAccessIpsSaveProvider);

  // PUBLIC: key -> JWT. tenantMiddleware resolves the company from companyCode in the body (tokenless path).
  app.post("/api-access/token", tenantMiddleware, apiAccessTokenProvider);

  // Called with the JWT from /api-access/token (or a normal login token).
  app.post("/api-access/products", authenticateToken, tenantMiddleware, requireAddon("api"), apiAccessProductsProvider);
  app.post("/api-access/categories", authenticateToken, tenantMiddleware, requireAddon("api"), apiAccessCategoriesProvider);
  app.post("/api-access/product-groups", authenticateToken, tenantMiddleware, requireAddon("api"), apiAccessProductGroupsProvider);
};
