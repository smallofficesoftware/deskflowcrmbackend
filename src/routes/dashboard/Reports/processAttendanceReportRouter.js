import { getProcessAttendance } from "../../../controllers/dashboard/Reports/processAttendanceReportController.js"
import { authenticateToken } from "../../../middlewares/auth.js"
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js"

export default (app) => {
    app.post("/get-process-attendance", authenticateToken, tenantMiddleware, getProcessAttendance)
}