import { teamPerformance } from "../../../controllers/dashboard/Reports/teamPerformanceReportController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post(
    "/getTeamPerformanceReport",
    tenantMiddleware,
    authenticateToken,
    teamPerformance
  );
};
