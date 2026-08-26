import { verifyReportPinController } from "../../controllers/company_setup/reportPinController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

// Feature-agnostic path — shared by Report Builder and Document Designer's
// build routes (both gated by requireReportPin, src/middlewares/reportPinAuth.js).
export default (app) => {
  app.post("/report-pin/verify", authenticateToken, tenantMiddleware, verifyReportPinController);
};
