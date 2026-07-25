import { allProduct, productUnitDelete } from "../../controllers/product_settings/productUnitController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/product-unit-get", authenticateToken, tenantMiddleware, allProduct);
    app.post("/unitDelete", authenticateToken, tenantMiddleware, productUnitDelete);
}
