import { allTargetVsIncentives } from "../../controllers/hr/targetVsIncentiveController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post(
    "/get-target-vs-Incentive",
    authenticateToken,
    tenantMiddleware,
    allTargetVsIncentives
  );
};
