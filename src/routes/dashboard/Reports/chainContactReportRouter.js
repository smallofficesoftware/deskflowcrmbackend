import { chainContactReport } from "../../../controllers/dashboard/Reports/chainContactReportController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/getChainContact", authenticateToken, tenantMiddleware, chainContactReport);
}