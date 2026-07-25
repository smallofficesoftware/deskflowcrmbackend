import { addTax, getTax, updateTax } from "../../controllers/product_settings/taxController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/add-tax", authenticateToken, tenantMiddleware, addTax);
    app.post("/get-tax", authenticateToken, tenantMiddleware, getTax);
    app.post("/update-tax", authenticateToken, tenantMiddleware, updateTax);
};
