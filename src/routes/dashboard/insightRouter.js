import {
  allInsight,
} from "../../controllers/dashboard/insightController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/insight", authenticateToken, tenantMiddleware, allInsight);

};
