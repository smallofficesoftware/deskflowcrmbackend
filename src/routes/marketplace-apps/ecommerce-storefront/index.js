import {
  getStorefrontSettingsController,
  getStorefrontThemesController,
  saveStorefrontSettingsController,
  selectStorefrontThemeController,
} from "../../../controllers/storefront/storefrontController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { requireAddon } from "../../../middlewares/requireAddon.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

// First slice of the ecommerce storefront addon's CRM admin settings page
// (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt, P1/4.4). Every route is
// gated by requireAddon('ecommerce-storefront') - the GENERIC primitive
// (src/middlewares/requireAddon.js), same pattern as marketplace-apps/
// tally/index.js. The CRM admin settings page uses the settings/get call's
// 403-vs-200 response as its own on/off check, same pattern Tally's
// settings page would use once it has one.
export default (app) => {
  app.post("/storefront/settings/get", authenticateToken, tenantMiddleware, requireAddon("ecommerce-storefront"), getStorefrontSettingsController);
  app.post("/storefront/settings/save", authenticateToken, tenantMiddleware, requireAddon("ecommerce-storefront"), saveStorefrontSettingsController);
  app.post("/storefront/themes/get", authenticateToken, tenantMiddleware, requireAddon("ecommerce-storefront"), getStorefrontThemesController);
  app.post("/storefront/theme/select", authenticateToken, tenantMiddleware, requireAddon("ecommerce-storefront"), selectStorefrontThemeController);
};
