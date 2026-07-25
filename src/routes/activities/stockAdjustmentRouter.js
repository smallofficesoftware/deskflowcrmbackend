import { deleteStockAdjustmentDeleteProvider, getAllStockDataProvider, getStockAdjustmentListProvider, inserStockAdjustmentProvider, warehouseWiseItemStockProvider } from "../../controllers/activities/stockAdjustmentController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post(
        "/insert-stock",
        authenticateToken,
        tenantMiddleware,
        inserStockAdjustmentProvider
    );
    app.post(
        "/get-stock-adjustment-list",
        authenticateToken,
        tenantMiddleware,
        getStockAdjustmentListProvider
    );
    app.post(
        "/delete-stock-adjustment",
        authenticateToken,
        tenantMiddleware,
        deleteStockAdjustmentDeleteProvider
    );
    app.post(
        "/warehouse-wise-item-stock",
        authenticateToken,
        tenantMiddleware,
        warehouseWiseItemStockProvider
    );
    app.post(
        "/get-all-stock-data",
        authenticateToken,
        tenantMiddleware,
        getAllStockDataProvider
    );
};