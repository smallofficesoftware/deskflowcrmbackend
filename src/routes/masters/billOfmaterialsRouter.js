import { billOfMaterialsCreate, deleteBillOfMaterialsCreate, getBom, updateBillOfMaterialsCreate } from "../../controllers/masters/billOfmaterialController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/bill_of_materials_create", authenticateToken, tenantMiddleware, billOfMaterialsCreate);
    app.post("/get_bill_of_materials", authenticateToken, tenantMiddleware, getBom);
    app.post("/bill_of_materials_update", authenticateToken, tenantMiddleware, updateBillOfMaterialsCreate);
    app.post("/billOfMaterialsDelete", authenticateToken, tenantMiddleware, deleteBillOfMaterialsCreate);
}