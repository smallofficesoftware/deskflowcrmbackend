import { monthlySlipProvider, proceedToAccountProvider, salaryFetchProvider, salaryProcessProvider } from "../../controllers/hr/salaryProcessController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { attendanceImageUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/salary/process", authenticateToken, attendanceImageUpload, tenantMiddleware, salaryProcessProvider);
    app.post("/salary/fetch", authenticateToken, attendanceImageUpload, tenantMiddleware, salaryFetchProvider);
    app.post("/salary/monthly-slip", authenticateToken, attendanceImageUpload, tenantMiddleware, monthlySlipProvider);
    app.post("/salary/acc", authenticateToken, attendanceImageUpload, tenantMiddleware, proceedToAccountProvider);
}