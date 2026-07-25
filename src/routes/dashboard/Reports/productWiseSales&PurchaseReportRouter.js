import {productSalesPurchase} from "../../../controllers/dashboard/Reports/productSalesPurchaseController.js"
import { authenticateToken } from "../../../middlewares/auth.js";
import { tenantMiddleware } from "../../../middlewares/tenantMiddleware.js";

export default(app)=>{
    app.post("/getProductSales&Purchase",tenantMiddleware,authenticateToken,productSalesPurchase);
} 