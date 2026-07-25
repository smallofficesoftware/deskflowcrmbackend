import { teamAttendance } from "../../../controllers/dashboard/Reports/teamAttendanceReportController.js"
import { authenticateToken } from "../../../middlewares/auth.js"
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js"

export default (app) => {
    app.post("/getTeamAttendanceReport", authenticateToken, tenantMiddleware, teamAttendance)
}