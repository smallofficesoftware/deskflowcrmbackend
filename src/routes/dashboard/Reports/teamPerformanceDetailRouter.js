import { getTeamPerformanceDetailProvider } from "../../../controllers/dashboard/Reports/teamPerformanceDetailController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/team-performance-detail", authenticateToken, tenantMiddleware, getTeamPerformanceDetailProvider);
};
