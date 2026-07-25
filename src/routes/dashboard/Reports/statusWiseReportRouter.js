import { getStatusReport } from "../../../controllers/dashboard/Reports/statusWiseReportController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/getStatusReport", authenticateToken, tenantMiddleware, getStatusReport);
}