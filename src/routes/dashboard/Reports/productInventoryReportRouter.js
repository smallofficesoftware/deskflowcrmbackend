import { productInventory } from "../../../controllers/dashboard/Reports/productInventoryController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/getProductInventoryReport", tenantMiddleware, authenticateToken, productInventory);
}