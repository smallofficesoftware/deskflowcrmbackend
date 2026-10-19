import {
  createAttributeMasterController,
  createAttributeValueMasterController,
  deleteAttributeMasterController,
  deleteAttributeValueMasterController,
  getAttributeMastersController,
  updateAttributeMasterController,
  updateAttributeValueMasterController,
} from "../../controllers/product_settings/productAttributeMasterController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

// Reusable attribute/value catalog (Settings > Attribute Master) -
// plans/2026-10-18-product-variants-and-qty-pricing-plan.txt.
export default (app) => {
  app.post("/get-attribute-masters", authenticateToken, tenantMiddleware, getAttributeMastersController);
  app.post("/create-attribute-master", authenticateToken, tenantMiddleware, createAttributeMasterController);
  app.post("/update-attribute-master", authenticateToken, tenantMiddleware, updateAttributeMasterController);
  app.post("/delete-attribute-master", authenticateToken, tenantMiddleware, deleteAttributeMasterController);
  app.post("/create-attribute-value-master", authenticateToken, tenantMiddleware, createAttributeValueMasterController);
  app.post("/update-attribute-value-master", authenticateToken, tenantMiddleware, updateAttributeValueMasterController);
  app.post("/delete-attribute-value-master", authenticateToken, tenantMiddleware, deleteAttributeValueMasterController);
};
