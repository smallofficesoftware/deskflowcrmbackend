import { getPriceListReportProvider } from "../../controllers/product_settings/priceListReportController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/price-list-report", authenticateToken, tenantMiddleware, getPriceListReportProvider);
};
