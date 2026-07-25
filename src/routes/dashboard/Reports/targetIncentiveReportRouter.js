
import { targetIncentiveReport } from "../../../controllers/dashboard/Reports/targetIncentiveReportController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post(
        "/getTargetIncentiveReport",
        tenantMiddleware,
        authenticateToken,
        targetIncentiveReport
    );
};
