import { addGlobalSearched, getSerpAccountDetails, getSerpCountries, getSerpSearch } from "../../controllers/dashboard/serpController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/global-search/:start/:device/:no_cache", authenticateToken, tenantMiddleware, getSerpSearch);
  app.post("/add-global-search-data", authenticateToken, tenantMiddleware, addGlobalSearched);
  app.post("/get-serp-account-details/:a_application_login_id", authenticateToken, tenantMiddleware, getSerpAccountDetails);
  app.post("/get-serp-countries/:query", authenticateToken, tenantMiddleware, getSerpCountries);
};