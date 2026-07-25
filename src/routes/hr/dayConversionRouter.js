import { addAdjustment, getAdjustment, updateAdjustment } from "../../controllers/hr/dayConversionController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/add-adjustment", authenticateToken, tenantMiddleware, addAdjustment);
    app.post("/get-day-adjustments", authenticateToken, tenantMiddleware, getAdjustment);
    app.post("/update-adjustment", authenticateToken, tenantMiddleware, updateAdjustment);
}