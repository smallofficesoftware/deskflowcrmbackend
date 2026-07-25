import { authenticateToken } from "../../../middlewares/auth.js";
import {getLableReport} from "../../../controllers/dashboard/Reports/lableWiseReportController.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default(app)=>{
    app.post("/getLableReport",authenticateToken,tenantMiddleware,getLableReport);
}