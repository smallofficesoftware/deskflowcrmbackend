import { assignLabelToJob, assignStatusToJob, assignTeamToJob, deleteProductionEntryProvider, fetchBomOrderItemsProvider, fetchBomProductsProvider, fetchProductionEntryDetailProvider, fetchWarehouseStockBatchProvider, jobCardDeleteProvider, jobCardsDetailsProvider, jobCardsFetchProductionListProvider, jobCardsFetchProvider, jobCardsSaveProvider, printBomProvider, productionEntryProvider, updateJobCardQtyProvider } from "../../controllers/production/JobCardController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
    app.post("/job-card/fetch", authenticateToken, tenantMiddleware, jobCardsFetchProvider);
    app.post("/job-card/detail", authenticateToken, tenantMiddleware, jobCardsDetailsProvider);
    app.post("/job-card/save", authenticateToken, tenantMiddleware, jobCardsSaveProvider);
    app.post("/job-card/products", authenticateToken, tenantMiddleware, fetchBomProductsProvider);
    app.post("/job-card/order-items", authenticateToken, tenantMiddleware, fetchBomOrderItemsProvider);
    app.post("/job-card/print-bom", authenticateToken, tenantMiddleware, printBomProvider);
    app.post("/job-card/delete", authenticateToken, tenantMiddleware, jobCardDeleteProvider);
    app.post("/job-card/production-entry/save", authenticateToken, tenantMiddleware, productionEntryProvider);
    app.post("/job-card/production-entry/list", authenticateToken, tenantMiddleware, jobCardsFetchProductionListProvider);
    app.post("/job-card/production-entry/detail", authenticateToken, tenantMiddleware, fetchProductionEntryDetailProvider);
    app.post("/job-card/production-entry/delete", authenticateToken, tenantMiddleware, deleteProductionEntryProvider);
    app.post("/job-card/warehouse-stock-batch", authenticateToken, tenantMiddleware, fetchWarehouseStockBatchProvider);

    app.post("/assign-team-to-job", authenticateToken, tenantMiddleware, assignTeamToJob);
    app.post("/assign-lable-to-job", authenticateToken, tenantMiddleware, assignLabelToJob);
    app.post("/assign-status-to-job", authenticateToken, tenantMiddleware, assignStatusToJob);
    app.post("/job-card/update", authenticateToken, tenantMiddleware, updateJobCardQtyProvider);

}