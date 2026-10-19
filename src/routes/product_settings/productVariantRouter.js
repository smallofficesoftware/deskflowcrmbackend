import {
  createVariantAttributeController,
  createVariantAttributeValueController,
  deleteVariantAttributeController,
  deleteVariantAttributeValueController,
  getVariantAttributesController,
  getVariantsController,
  setVariantOptionValuesController,
} from "../../controllers/product_settings/productVariantController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

// Multi-variant products - plans/2026-10-18-product-variants-and-qty-pricing-plan.txt.
export default (app) => {
  app.post("/get-variant-attributes", authenticateToken, tenantMiddleware, getVariantAttributesController);
  app.post("/create-variant-attribute", authenticateToken, tenantMiddleware, createVariantAttributeController);
  app.post("/delete-variant-attribute", authenticateToken, tenantMiddleware, deleteVariantAttributeController);
  app.post("/create-variant-attribute-value", authenticateToken, tenantMiddleware, createVariantAttributeValueController);
  app.post("/delete-variant-attribute-value", authenticateToken, tenantMiddleware, deleteVariantAttributeValueController);
  app.post("/get-variants", authenticateToken, tenantMiddleware, getVariantsController);
  app.post("/set-variant-option-values", authenticateToken, tenantMiddleware, setVariantOptionValuesController);
};
