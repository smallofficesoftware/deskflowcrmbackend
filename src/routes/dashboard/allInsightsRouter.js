import { crmInsight, hrmsInsight, hrmsLeaderboard, hrmsTeamTracking, productionInsight } from "../../controllers/dashboard/allInsightsController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/crm-insight", authenticateToken, tenantMiddleware, crmInsight);
    app.post("/hrms-insight", authenticateToken, tenantMiddleware, hrmsInsight);
    app.post("/hrms-leaderboard", authenticateToken, tenantMiddleware, hrmsLeaderboard);
    app.post("/hrms-team-tracking", authenticateToken, tenantMiddleware, hrmsTeamTracking);
    app.post("/production-insight", authenticateToken, tenantMiddleware, productionInsight);
};