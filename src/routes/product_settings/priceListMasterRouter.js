import {
  allPriceListMaster,
} from "../../controllers/product_settings/priceListMasterController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
export default (app) => {
  app.post("/priceListMaster", authenticateToken, tenantMiddleware, allPriceListMaster);
};
