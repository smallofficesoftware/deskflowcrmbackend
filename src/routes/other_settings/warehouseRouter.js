import { getwarehouse, WareHouseCreate } from "../../controllers/other_settings/warehouseController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/getwarehouse", authenticateToken, tenantMiddleware, getwarehouse);
    app.post("/warehouse-create", authenticateToken, tenantMiddleware, WareHouseCreate);
}