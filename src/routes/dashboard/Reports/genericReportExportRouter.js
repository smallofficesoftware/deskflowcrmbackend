import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";
import { exportReportExcelController } from "../../../controllers/dashboard/Reports/genericReportExportController.js";

export default (app) => {
  app.post("/reports/export-excel", authenticateToken, tenantMiddleware, exportReportExcelController);
};
