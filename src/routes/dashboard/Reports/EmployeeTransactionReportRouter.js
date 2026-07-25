import { employeeAccountOutstandingReport, employeeAccountTranctionReport } from "../../../controllers/dashboard/Reports/employeeTransactionReportController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {

    app.post(
        "/employeeAccountTranctionsReport",
        authenticateToken,
        tenantMiddleware,
        employeeAccountTranctionReport
    );

    app.post(
        "/employeeAccountOutstandingReport",
        authenticateToken,
        tenantMiddleware,
        employeeAccountOutstandingReport
    );
};