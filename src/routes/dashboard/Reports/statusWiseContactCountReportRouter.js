import { getStatusWiseContactCountReport } from "../../../controllers/dashboard/Reports/statusWiseContactCountReportController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/getStatusWiseContactAndInquiryCountReport", authenticateToken, tenantMiddleware, getStatusWiseContactCountReport);
}