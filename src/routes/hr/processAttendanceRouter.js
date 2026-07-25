import { attendanceDetailUpdateProvider, compensationCalcProvider, fetchMonthlySlipEmployeeProvider, fetchMonthlySlipProvider, fetchProcessListProvider, initializingProvider, misPunchListProvider } from "../../controllers/hr/processAttendanceController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { attendanceImageUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/attendance/mis-punch-list", authenticateToken, attendanceImageUpload, tenantMiddleware, misPunchListProvider);
    app.post("/attendance/initializing", authenticateToken, attendanceImageUpload, tenantMiddleware, initializingProvider);
    app.post("/attendance/attendance-d-up", authenticateToken, attendanceImageUpload, tenantMiddleware, attendanceDetailUpdateProvider);
    app.post("/attendance/compensation-calc", authenticateToken, attendanceImageUpload, tenantMiddleware, compensationCalcProvider);
    app.post("/attendance/processed-list", authenticateToken, attendanceImageUpload, tenantMiddleware, fetchProcessListProvider);
    app.post("/attendance/monthly-slip", authenticateToken, attendanceImageUpload, tenantMiddleware, fetchMonthlySlipProvider);
    app.post("/attendance/monthly-slip-employee-fetch", authenticateToken, attendanceImageUpload, tenantMiddleware, fetchMonthlySlipEmployeeProvider);
}