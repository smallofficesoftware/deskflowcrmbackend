import {
  serialLookup,
  serialRequirement,
} from "../../controllers/serial_requirement/serialRequirementController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/serial-requirement", authenticateToken, tenantMiddleware, serialRequirement);
  app.post("/serial-requirement/lookup", authenticateToken, tenantMiddleware, serialLookup);
};
