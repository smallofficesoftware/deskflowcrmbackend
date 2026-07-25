import { authenticateToken } from "../../../middlewares/auth.js";
import {getSourceReport} from "../../../controllers/dashboard/Reports/sourceReportController.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default(app)=>{
    app.post("/getSourceReport",authenticateToken,tenantMiddleware,getSourceReport);
}