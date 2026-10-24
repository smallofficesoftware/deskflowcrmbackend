import { getMyDaySummaryProvider } from "../../controllers/activities/myDaySummaryController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/my-day-summary", authenticateToken, tenantMiddleware, getMyDaySummaryProvider);
};
