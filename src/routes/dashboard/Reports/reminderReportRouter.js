import { authenticateToken } from "../../../middlewares/auth.js";
import { getReminders } from "../../../controllers/dashboard/Reports/reminderReportController.js";
import {tenantMiddleware} from "../../../middlewares/tenantMiddleware.js";

export default(app)=>{
    app.post("/getAllReminderReports",authenticateToken,tenantMiddleware,getReminders);
}