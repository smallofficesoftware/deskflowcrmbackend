import { fetchCustomerSupportTicketStatusLog, fetchStatus, fetchStatusLog } from "../../controllers/status_log/statusLogController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/fetch-status-log", authenticateToken, tenantMiddleware, fetchStatusLog);
    app.post("/get-status", authenticateToken, tenantMiddleware, fetchStatus);
    app.post("/fetch-customer-status-log", authenticateToken, fetchCustomerSupportTicketStatusLog);

};