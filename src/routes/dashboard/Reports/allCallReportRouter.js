import { authenticateToken } from "../../../middlewares/auth.js";
import { allCallReport } from "../../../controllers/dashboard/Reports/allContactController.js";
import {tenantMiddleware} from "../../../middlewares/tenantMiddleware.js";

export default (app)=>{
    app.post("/getCallReport",authenticateToken,tenantMiddleware,allCallReport)
} 