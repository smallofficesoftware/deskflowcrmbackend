import {
  deleteProductImageController,
  getProductImagesController,
  reorderProductImagesController,
  setPrimaryProductImageController,
  uploadProductImageController,
} from "../../controllers/product_settings/productImageController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { productUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

// Multiple photos per product/variant - plans/2026-10-20-product-variant-ui-and-field-scoping-plan.txt.
export default (app) => {
  app.post("/get-product-images", authenticateToken, tenantMiddleware, getProductImagesController);
  app.post("/upload-product-image", authenticateToken, tenantMiddleware, productUpload.single("image"), uploadProductImageController);
  app.post("/delete-product-image", authenticateToken, tenantMiddleware, deleteProductImageController);
  app.post("/set-primary-product-image", authenticateToken, tenantMiddleware, setPrimaryProductImageController);
  app.post("/reorder-product-images", authenticateToken, tenantMiddleware, reorderProductImagesController);
};
