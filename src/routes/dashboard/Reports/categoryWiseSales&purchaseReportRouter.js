import {categorySalesPurchase} from "../../../controllers/dashboard/Reports/categorySalesPurchaseController.js"
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default(app)=>{
    app.post("/getCategorySales&Purchase",tenantMiddleware,authenticateToken,categorySalesPurchase);
} 