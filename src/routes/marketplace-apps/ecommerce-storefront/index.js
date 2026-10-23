import {
  getStorefrontCategoryBySlugController,
  getStorefrontCategoryTreeController,
  getStorefrontCompanyInfoController,
  getStorefrontProductBySlugController,
  getStorefrontProductsController,
} from "../../../controllers/storefront/storefrontCatalogController.js";
import {
  getStorefrontSettingsController,
  getStorefrontThemesController,
  saveStorefrontSettingsController,
  selectStorefrontThemeController,
} from "../../../controllers/storefront/storefrontController.js";
import {
  getStorefrontMeController,
  requestStorefrontOtpController,
  setStorefrontPinController,
  storefrontInviteLoginController,
  storefrontLightLoginController,
  storefrontPinLoginController,
  verifyStorefrontOtpController,
} from "../../../controllers/storefront/storefrontAuthController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { requireAddon } from "../../../middlewares/requireAddon.js";
import { requireStorefrontSession } from "../../../services/storefront/storefrontSession.js";
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

  // PUBLIC catalog reads (P2/4.2) - deliberately NO authenticateToken/tenantMiddleware/
  // requireAddon here, per 4.2's own text: "requireAddon() on every route except
  // public catalog reads." An anonymous visitor/crawler on a resolved subdomain
  // must be able to browse without a session or an addon-enabled check blocking
  // them - each service call resolves its own tenant DB from :companySlug instead
  // (storefrontCompanyResolver.js).
  app.get("/storefront/:companySlug/info", getStorefrontCompanyInfoController);
  app.get("/storefront/:companySlug/categories", getStorefrontCategoryTreeController);
  app.get("/storefront/:companySlug/categories/:slug", getStorefrontCategoryBySlugController);
  app.get("/storefront/:companySlug/products", getStorefrontProductsController);
  app.get("/storefront/:companySlug/products/:slug", getStorefrontProductBySlugController);

  // Customer accounts (P3/4.2a/Q3) - also PUBLIC/ungated in the authenticateToken/
  // tenantMiddleware/requireAddon sense (there is no req.user for an anonymous
  // customer), but NOT addon-gate-free like catalog reads: each service call does
  // its own inline resolveCompanyBySlug() + isAppEnabledForCompany() check instead
  // (storefrontAuthService.js's resolveAndGate helper) - identified during P1/P2
  // as a requirement requireAddon() itself can't satisfy for this audience.
  app.post("/storefront/:companySlug/auth/otp/request", requestStorefrontOtpController);
  app.post("/storefront/:companySlug/auth/otp/verify", verifyStorefrontOtpController);
  app.post("/storefront/:companySlug/auth/pin-login", storefrontPinLoginController);
  app.post("/storefront/:companySlug/auth/light-login", storefrontLightLoginController);
  app.post("/storefront/:companySlug/auth/invite-login", storefrontInviteLoginController);

  // Logged-in customer (requireStorefrontSession resolves req.tenantDB itself from
  // the session token's a_application_login_id/company_masters_id - see that
  // middleware's own comment; no tenantMiddleware here, that one assumes CRM staff
  // auth shape).
  app.get("/storefront/me", requireStorefrontSession, getStorefrontMeController);
  app.post("/storefront/me/pin", requireStorefrontSession, setStorefrontPinController);
};
