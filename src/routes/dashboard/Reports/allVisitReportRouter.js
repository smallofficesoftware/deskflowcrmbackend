import { allVisitReport } from "../../../controllers/dashboard/Reports/allVisitReportController.js";
import {tenantMiddleware} from "../../../middlewares/tenantMiddleware.js";
import {authenticateToken} from "../../../middlewares/auth.js";


export default (app)=>{
    app.post("/getVisitReport",authenticateToken,tenantMiddleware,allVisitReport)
} 