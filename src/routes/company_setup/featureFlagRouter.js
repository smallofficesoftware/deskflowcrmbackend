import { getFeatureFlagController, setFeatureFlagController } from "../../controllers/company_setup/featureFlagController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/set-feature-flag", authenticateToken, tenantMiddleware, setFeatureFlagController);
  app.post("/get-feature-flag", authenticateToken, tenantMiddleware, getFeatureFlagController);
};
