import { addAdjustmentTypes, getAdjustmentTypes, updateAdjustmentTypes } from "../../controllers/hr/adjustmentTypeController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/get-adjustment-type", authenticateToken, tenantMiddleware, getAdjustmentTypes);
    app.post("/add-adjustment-type", authenticateToken, tenantMiddleware, addAdjustmentTypes);
    app.post("/update-adjustment-type", authenticateToken, tenantMiddleware, updateAdjustmentTypes);
}