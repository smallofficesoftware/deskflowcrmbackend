import { authenticateToken } from "../../../middlewares/auth.js";
import {allcontactReport} from "../../../controllers/dashboard/Reports/allContactReportController.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default(app)=>{
    app.post("/getAllcontactReport",authenticateToken,tenantMiddleware,allcontactReport);
}