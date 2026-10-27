import { getReportCatalogProvider } from "../../controllers/report_catalog/reportCatalogController.js";
import { authenticateToken } from "../../middlewares/auth.js";

export default (app) => {
    app.post("/report-catalog", authenticateToken, getReportCatalogProvider);
};
