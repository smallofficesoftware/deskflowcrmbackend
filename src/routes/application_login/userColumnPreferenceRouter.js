import {
  getColumnPreferenceController,
  saveColumnPreferenceController,
} from "../../controllers/application_login/userColumnPreferenceController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post(
    "/get-column-preference",
    authenticateToken,
    tenantMiddleware,
    getColumnPreferenceController
  );
  app.post(
    "/save-column-preference",
    authenticateToken,
    tenantMiddleware,
    saveColumnPreferenceController
  );
};
