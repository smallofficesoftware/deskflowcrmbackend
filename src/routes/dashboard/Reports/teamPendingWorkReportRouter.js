import {teamPendingWork} from "../../../controllers/dashboard/Reports/teamPendingWorkReportController.js";
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";
export default (app) =>{
    app.post("/getTeamPendingWorkReport",tenantMiddleware,authenticateToken,teamPendingWork);
}