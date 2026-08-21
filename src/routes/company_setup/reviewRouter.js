import {
  listReviewsController,
  submitReviewController,
  submitStorePromptResponseController,
} from "../../controllers/company_setup/reviewController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/review/submit", authenticateToken, tenantMiddleware, submitReviewController);
  app.post("/review/store-prompt-response", authenticateToken, tenantMiddleware, submitStorePromptResponseController);
  app.post("/review/list", authenticateToken, tenantMiddleware, listReviewsController);
};
