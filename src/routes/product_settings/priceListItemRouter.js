import {
  addPriceListCategoryWise,
  allPriceListItem,
  DeleteAllPrinceList,
  exportsPriceListForUpdateData,
  getQtySlabsController,
  saveQtySlabsController
} from "../../controllers/product_settings/priceListItemController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/priceListItem", authenticateToken, tenantMiddleware, allPriceListItem);
  app.post("/delete-pricelist", authenticateToken, tenantMiddleware, DeleteAllPrinceList);
  app.post("/delete-pricelist", authenticateToken, tenantMiddleware, DeleteAllPrinceList);
  app.post("/add-pricelist-category-wise", authenticateToken, tenantMiddleware, addPriceListCategoryWise);
  app.post("/qty-slabs/get", authenticateToken, tenantMiddleware, getQtySlabsController);
  app.post("/qty-slabs/save", authenticateToken, tenantMiddleware, saveQtySlabsController);
  app.post("/generate-pricelist-update-sheet", authenticateToken, tenantMiddleware, exportsPriceListForUpdateData);
};
