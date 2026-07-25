import { getDynamicOptions } from "../../controllers/activities/quickSearchController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/get-dynamic-options", authenticateToken, tenantMiddleware, getDynamicOptions);
};