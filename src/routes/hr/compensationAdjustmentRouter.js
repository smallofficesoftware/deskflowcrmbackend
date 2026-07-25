import { adjustmentTypesFetchProvider, compensationAdjustmentDeleteProvider, compensationAdjustmentFetchProvider, compensationAdjustmentInsertProvider, compensationAdjustmentUpdateProvider } from "../../controllers/hr/compensationAdjustmentController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { attendanceImageUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/compensation-adjustments/insert", authenticateToken, attendanceImageUpload, tenantMiddleware, compensationAdjustmentInsertProvider);
    app.post("/compensation-adjustments/fetch", authenticateToken, attendanceImageUpload, tenantMiddleware, compensationAdjustmentFetchProvider);
    app.post("/compensation-adjustments/update", authenticateToken, attendanceImageUpload, tenantMiddleware, compensationAdjustmentUpdateProvider);
    app.post("/compensation-adjustments/delete", authenticateToken, attendanceImageUpload, tenantMiddleware, compensationAdjustmentDeleteProvider);
    app.post("/compensation-adjustments/types", authenticateToken, attendanceImageUpload, tenantMiddleware, adjustmentTypesFetchProvider);
}