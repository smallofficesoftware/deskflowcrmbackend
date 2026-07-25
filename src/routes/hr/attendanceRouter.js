import { checkAttendance, createAttendance, deleteAttendance, generateAttendanceSampleSheetProvider, updateAttendance, viewAttendance, viewAttendanceByDate } from "../../controllers/hr/userAttendanceController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { attendanceImageUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {

    app.post("/check-attendance", authenticateToken, attendanceImageUpload, tenantMiddleware, checkAttendance);
    app.post("/view-attendance", authenticateToken, tenantMiddleware, viewAttendance);
    app.post("/delete-attendance", authenticateToken, tenantMiddleware, deleteAttendance);
    app.post("/update-attendance", authenticateToken, tenantMiddleware, updateAttendance);
    app.post("/create-attendance", authenticateToken, tenantMiddleware, createAttendance);
    app.post("/view-attendance-date", authenticateToken, tenantMiddleware, viewAttendanceByDate);
    app.post("/generate-attendance-sheet", authenticateToken, tenantMiddleware, generateAttendanceSampleSheetProvider);

}