import { getSalaryRegistration } from "../../../controllers/dashboard/Reports/SalaryRegisterReportController.js"
import { authenticateToken } from "../../../middlewares/auth.js"
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js"

export default (app) => {
    app.post("/get-salary-registration", authenticateToken, tenantMiddleware, getSalaryRegistration)
}