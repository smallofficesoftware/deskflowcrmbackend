import { getWarehouseTransferReportProvider } from "../../controllers/activities/warehouseTransferReportController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post(
        "/warehouse-transfer-report",
        authenticateToken,
        tenantMiddleware,
        getWarehouseTransferReportProvider
    );
};
