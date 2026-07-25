import {authenticateToken} from "../../../middlewares/auth.js";
import {getallstatisticscontact,getallreportscontact} from "../../../controllers/dashboard/statisticsController.js";
import {tenantMiddleware} from "../../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/getallstatistics", authenticateToken, tenantMiddleware, getallstatisticscontact);
    app.post("/getallreport", authenticateToken, tenantMiddleware, getallreportscontact);
};

