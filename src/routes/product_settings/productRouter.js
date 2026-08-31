import { allProduct, b2ballProduct, createProduct, DeleteProduct, exportsProducts, exportsProductsForUpdateData, generateProductSampleSheetProvider, getProductStockMovement, getSerialNumberStock, saveProductDesignerPage, updateProduct } from "../../controllers/product_settings/productController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { productUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/product", authenticateToken, tenantMiddleware, allProduct);
  app.post("/b2bgetproduct", b2ballProduct);
  app.post("/create-product", authenticateToken, tenantMiddleware, productUpload.single("product_img"), createProduct);
  app.post("/update-product", authenticateToken, tenantMiddleware, productUpload.single("product_img"), updateProduct);
  app.post("/product/set-designer-page", authenticateToken, tenantMiddleware, saveProductDesignerPage);
  app.post("/get-product-stock-movement", authenticateToken, tenantMiddleware, getProductStockMovement);
  app.post("/delete-product", authenticateToken, tenantMiddleware, DeleteProduct);
  app.post("/generate-product-sample-sheet", authenticateToken, tenantMiddleware, generateProductSampleSheetProvider);
  app.post("/export-product", authenticateToken, tenantMiddleware, exportsProducts);
  app.post("/generate-product-update-sheet", authenticateToken, tenantMiddleware, exportsProductsForUpdateData);
  app.post("/get-serial-number-stock", authenticateToken, tenantMiddleware, getSerialNumberStock);
};
