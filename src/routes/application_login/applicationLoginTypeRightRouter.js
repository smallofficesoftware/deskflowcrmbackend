import { createApplicationLoginTypeRights, teamRightsGet } from "../../controllers/application_login/applicationLoginTypeRightsController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
export default (app) => {
  app.post(
    "/createAppLoginRights",
    authenticateToken,
    tenantMiddleware,
    createApplicationLoginTypeRights
  );
  app.post(
    "/getTeamRights",
    authenticateToken,
    tenantMiddleware,
    teamRightsGet
  );
};
