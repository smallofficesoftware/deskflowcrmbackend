import { callHistory, getcallHistory, getcontactWiseCallHistory } from "../../controllers/activities/callHistroyController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { callHistoryUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/call-history", authenticateToken, tenantMiddleware, callHistoryUpload, callHistory);
  app.post("/getcall", authenticateToken, tenantMiddleware, getcallHistory);
  app.post("/contactwise-callhistory-log", authenticateToken, tenantMiddleware, getcontactWiseCallHistory);
};


