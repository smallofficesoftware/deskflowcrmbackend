import { allSourceOfTypes} from "../../controllers/masters/sourceOfTypesController.js"
import {authenticateToken} from "../../middlewares/auth.js";
import {tenantMiddleware} from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/sourceOfTypes", authenticateToken, tenantMiddleware,  allSourceOfTypes);
};
