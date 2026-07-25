import { bomDetails, createItemList, createProcessList, createProcessMasters, deleteBomDetails, deleteItemList, deleteProcessList, getAllBomData, getBomDetails, getCosting, getCostingRates, getItemList, getProcessLists, getProcessMasters, updateCosting, updateProcessList, updateProcessMasters } from "../../controllers/product_settings/productBillOfMaterialController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { uploadBOM } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/bom-details", authenticateToken, tenantMiddleware, uploadBOM.fields([
        { name: "bom_document", maxCount: 1 },
        { name: "bom_drawing", maxCount: 1 },
    ]), bomDetails);
    app.post("/get-bom-details", authenticateToken, tenantMiddleware, getBomDetails);
    app.post("/delete-bom-details", authenticateToken, tenantMiddleware, deleteBomDetails);
    app.post("/create-process-masters", authenticateToken, tenantMiddleware, createProcessMasters);
    app.post("/update-process-masters", authenticateToken, tenantMiddleware, updateProcessMasters);
    app.post("/get-process-masters", authenticateToken, tenantMiddleware, getProcessMasters);
    app.post("/create-process-list", authenticateToken, tenantMiddleware, createProcessList);
    app.post("/update-process-list", authenticateToken, tenantMiddleware, updateProcessList);
    app.post("/get-process-lists", authenticateToken, tenantMiddleware, getProcessLists);
    app.post("/delete-process-list", authenticateToken, tenantMiddleware, deleteProcessList);
    app.post("/update-costing", authenticateToken, tenantMiddleware, updateCosting);
    app.post("/get-costing", authenticateToken, tenantMiddleware, getCosting);
    app.post("/create-item-list", authenticateToken, tenantMiddleware, createItemList);
    app.post("/get-item-list", authenticateToken, tenantMiddleware, getItemList);
    app.post("/delete-item-list", authenticateToken, tenantMiddleware, deleteItemList);
    app.post("/get-costing-rates", authenticateToken, tenantMiddleware, getCostingRates);
    app.post("/get-all-bom-data", authenticateToken, tenantMiddleware, getAllBomData);
};