import { adjustmentTypesFetchProvider, compensationAdjustmentDeleteProvider, compensationAdjustmentFetchProvider, compensationAdjustmentInsertProvider, compensationAdjustmentUpdateProvider, generateCompensationAdjustmentSampleSheetProvider, getExcelSheetCompensationAdjustmentProvider } from "../../controllers/hr/compensationAdjustmentController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { attendanceImageUpload, uploadExcelSheet } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/compensation-adjustments/insert", authenticateToken, attendanceImageUpload, tenantMiddleware, compensationAdjustmentInsertProvider);
    app.post("/compensation-adjustments/fetch", authenticateToken, attendanceImageUpload, tenantMiddleware, compensationAdjustmentFetchProvider);
    app.post("/compensation-adjustments/update", authenticateToken, attendanceImageUpload, tenantMiddleware, compensationAdjustmentUpdateProvider);
    app.post("/compensation-adjustments/delete", authenticateToken, attendanceImageUpload, tenantMiddleware, compensationAdjustmentDeleteProvider);
    app.post("/compensation-adjustments/types", authenticateToken, attendanceImageUpload, tenantMiddleware, adjustmentTypesFetchProvider);
    app.post("/excel-sheet-compensation-adjustment", authenticateToken, tenantMiddleware, uploadExcelSheet.single("file"), getExcelSheetCompensationAdjustmentProvider);
    app.post("/generate-compensation-adjustment-sample-sheet", authenticateToken, tenantMiddleware, generateCompensationAdjustmentSampleSheetProvider);
}