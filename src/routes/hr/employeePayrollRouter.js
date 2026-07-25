import { createEmpPayroll, fetchEmpPayroll, updateEmpPayroll } from "../../controllers/hr/employeePayrollController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {

    app.post("/create-emp-payroll", authenticateToken, tenantMiddleware, createEmpPayroll);
    app.post("/fetch-employee-payroll", authenticateToken, tenantMiddleware, fetchEmpPayroll);
    app.post("/update-emp-payroll", authenticateToken, tenantMiddleware, updateEmpPayroll);

}