import { allReminder } from "../../controllers/activities/reminderController.js"
import {authenticateToken} from "../../middlewares/auth.js";
import {tenantMiddleware} from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/reminder", authenticateToken, tenantMiddleware,  allReminder);
};
