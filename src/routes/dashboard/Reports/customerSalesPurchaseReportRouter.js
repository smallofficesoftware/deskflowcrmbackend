import { customerSalesPurchaseReport } from "../../../controllers/dashboard/Reports/customerSalesPurchaseReportController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post(
        "/getCustomerSalesPurchaseReport",
        tenantMiddleware,
        authenticateToken,
        customerSalesPurchaseReport
    );
};
