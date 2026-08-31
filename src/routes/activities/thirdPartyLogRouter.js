import { clearThirdPartyLogsProvider, getThirdPartyLogsProvider } from "../../controllers/activities/thirdPartyLogController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/get-third-party-logs", authenticateToken, tenantMiddleware, getThirdPartyLogsProvider);
    app.post("/clear-third-party-logs", authenticateToken, tenantMiddleware, clearThirdPartyLogsProvider);
};
