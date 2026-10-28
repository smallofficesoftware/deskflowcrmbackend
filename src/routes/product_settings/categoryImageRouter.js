import {
  deleteCategoryImageController,
  getCategoryImageController,
  uploadCategoryImageController,
} from "../../controllers/product_settings/categoryImageController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { productUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

// One image per category, for the ecommerce storefront (23-10-2026).
export default (app) => {
  app.post("/get-category-image", authenticateToken, tenantMiddleware, getCategoryImageController);
  app.post("/upload-category-image", authenticateToken, tenantMiddleware, productUpload.single("image"), uploadCategoryImageController);
  app.post("/delete-category-image", authenticateToken, tenantMiddleware, deleteCategoryImageController);
};
