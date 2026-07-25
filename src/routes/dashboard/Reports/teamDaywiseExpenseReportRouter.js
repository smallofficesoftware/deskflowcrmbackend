import { authenticateToken } from "../../../middlewares/auth.js";
import { getTeamExpense } from "../../../controllers/dashboard/Reports/teamDayExpenseController.js";
import {tenantMiddleware} from "../../../middlewares/tenantMiddleware.js";

export default(app)=>{
    app.post("/getTeamWiseExpense",authenticateToken,tenantMiddleware,getTeamExpense);
}