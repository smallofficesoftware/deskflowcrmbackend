import { changeStageWithFormProvider } from "../../controllers/stage_change/stageChangeWithFormController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/change-stage-with-form", authenticateToken, tenantMiddleware, changeStageWithFormProvider);
};
