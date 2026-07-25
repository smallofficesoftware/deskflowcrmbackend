import { categoryDelete, groupDelete, paymentTypeDelete, taskcategoryDelete, warehouseDelete } from "../../controllers/product_settings/categoryDeleteController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/categoryDelete", authenticateToken, tenantMiddleware, categoryDelete);
    app.post("/taskcategoryDelete", authenticateToken, tenantMiddleware, taskcategoryDelete);
    app.post("/wareHouseDelete", authenticateToken, tenantMiddleware, warehouseDelete);
    app.post("/groupDelete", authenticateToken, tenantMiddleware, groupDelete);
    app.post("/paymentTypeDelete", authenticateToken, tenantMiddleware, paymentTypeDelete);
}