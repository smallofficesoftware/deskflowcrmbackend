import { getTeamTask } from "../../../controllers/dashboard/Reports/teamAllTaskReportController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/getTeamAllTask", authenticateToken, tenantMiddleware, getTeamTask);
}