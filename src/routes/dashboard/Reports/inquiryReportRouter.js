import { authenticateToken } from "../../../middlewares/auth.js";
import { getInquiryReport } from "../../../controllers/dashboard/Reports/inquiryReportController.js"
import {tenantMiddleware} from "../../../middlewares/tenantMiddleware.js";

export default(app)=>{
    app.post("/getInquiryReport",authenticateToken,tenantMiddleware,getInquiryReport)
}