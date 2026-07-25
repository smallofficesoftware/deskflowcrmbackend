import { getPaymentTypeWiseAccount } from "../../../controllers/dashboard/Reports/paymentTypeWiseAccountController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/get-payment-type-wise-account", authenticateToken, tenantMiddleware, getPaymentTypeWiseAccount);
}