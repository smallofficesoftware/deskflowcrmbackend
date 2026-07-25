import { getDetailedExpense } from "../../../controllers/dashboard/Reports/expenseDetailedReportController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/get-detailed-expense", authenticateToken, tenantMiddleware, getDetailedExpense);
}