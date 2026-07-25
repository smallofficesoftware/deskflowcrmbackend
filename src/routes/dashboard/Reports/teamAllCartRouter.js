import { getDailySalesInvoice, getdetailOrderReport, getGstInOut, teamAllCarts } from "../../../controllers/dashboard/Reports/teamAllCartControllers.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/getTeamAllCarts", authenticateToken, tenantMiddleware, teamAllCarts);
    app.post("/getdetailOrderReport", authenticateToken, tenantMiddleware, getdetailOrderReport);
    app.post("/getDailySalesInv", authenticateToken, tenantMiddleware, getDailySalesInvoice);
    app.post("/getGstInOut", authenticateToken, tenantMiddleware, getGstInOut);
}