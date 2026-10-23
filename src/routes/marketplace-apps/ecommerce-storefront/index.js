import {
  getStorefrontCategoryBySlugController,
  getStorefrontCategoryTreeController,
  getStorefrontCompanyInfoController,
  getStorefrontProductBySlugController,
  getStorefrontProductsController,
} from "../../../controllers/storefront/storefrontCatalogController.js";
import {
  getLockedAccountsController,
  getStorefrontSettingsController,
  getStorefrontThemesController,
  saveStorefrontSettingsController,
  selectStorefrontThemeController,
  unlockStorefrontAccountController,
} from "../../../controllers/storefront/storefrontController.js";
import {
  getStorefrontAuthConfigController,
  getStorefrontMeController,
  requestStorefrontOtpController,
  setStorefrontPinController,
  storefrontInviteLoginController,
  storefrontLightLoginController,
  storefrontPinLoginController,
  updateStorefrontMeController,
  verifyStorefrontOtpController,
} from "../../../controllers/storefront/storefrontAuthController.js";
import {
  getStorefrontAreasController,
  getStorefrontCitiesController,
  getStorefrontCountriesController,
  getStorefrontStatesController,
} from "../../../controllers/storefront/storefrontLocationController.js";
import { createStorefrontCheckoutController } from "../../../controllers/storefront/storefrontCheckoutController.js";
import {
  createStorefrontPaymentOrderController,
  verifyStorefrontPaymentController,
} from "../../../controllers/storefront/storefrontPaymentController.js";
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
  app.post("/storefront/locked-accounts/get", authenticateToken, tenantMiddleware, requireAddon("ecommerce-storefront"), getLockedAccountsController);
  app.post("/storefront/locked-accounts/unlock", authenticateToken, tenantMiddleware, requireAddon("ecommerce-storefront"), unlockStorefrontAccountController);

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

  // Cascading location lookups for the address form (P3, 23-10-2026) - public/
  // read-only mirrors of the per-tenant a_countries/a_states/a_cities/a_areas
  // master tables (storefrontLocationService.js's own comment has the full
  // reasoning for why these are new rather than reusing the internal commonGet).
  app.get("/storefront/:companySlug/locations/countries", getStorefrontCountriesController);
  app.get("/storefront/:companySlug/locations/states", getStorefrontStatesController);
  app.get("/storefront/:companySlug/locations/cities", getStorefrontCitiesController);
  app.get("/storefront/:companySlug/locations/areas", getStorefrontAreasController);

  // Customer accounts (P3/4.2a/Q3) - also PUBLIC/ungated in the authenticateToken/
  // tenantMiddleware/requireAddon sense (there is no req.user for an anonymous
  // customer), but NOT addon-gate-free like catalog reads: each service call does
  // its own inline resolveCompanyBySlug() + isAppEnabledForCompany() check instead
  // (storefrontAuthService.js's resolveAndGate helper) - identified during P1/P2
  // as a requirement requireAddon() itself can't satisfy for this audience.
  app.get("/storefront/:companySlug/auth/config", getStorefrontAuthConfigController);
  app.post("/storefront/:companySlug/auth/otp/request", requestStorefrontOtpController);
  app.post("/storefront/:companySlug/auth/otp/verify", verifyStorefrontOtpController);
  app.post("/storefront/:companySlug/auth/pin-login", storefrontPinLoginController);
  app.post("/storefront/:companySlug/auth/light-login", storefrontLightLoginController);
  app.post("/storefront/:companySlug/auth/invite-login", storefrontInviteLoginController);

  // P4 (23-10-2026) - checkout only, no payment wiring yet. Public like the
  // auth routes above (an anonymous guest can check out too, per Q6) - each
  // call resolves/gates itself the same way.
  app.post("/storefront/:companySlug/checkout", createStorefrontCheckoutController);

  // P4 payment (23-10-2026) - create-order then verify, mirroring the EXISTING
  // CRM billing pattern (thirdPartyIntegrationService.js's addPlanByRrazorpay/
  // razorpayPaymentVerify) with per-company keys instead of the global env
  // vars. Public like checkout above - same reasoning (guest checkout).
  app.post("/storefront/:companySlug/payments/create-order", createStorefrontPaymentOrderController);
  app.post("/storefront/:companySlug/payments/verify", verifyStorefrontPaymentController);

  // Logged-in customer (requireStorefrontSession resolves req.tenantDB itself from
  // the session token's a_application_login_id/company_masters_id - see that
  // middleware's own comment; no tenantMiddleware here, that one assumes CRM staff
  // auth shape).
  app.get("/storefront/me", requireStorefrontSession, getStorefrontMeController);
  app.put("/storefront/me", requireStorefrontSession, updateStorefrontMeController);
  app.post("/storefront/me/pin", requireStorefrontSession, setStorefrontPinController);
};
