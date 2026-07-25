
import { getprintSetting, newrightsprint, printSetting } from "../../controllers/company_setup/printSettingController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";


export default (app) => {
  app.post("/printSetting", authenticateToken, tenantMiddleware, printSetting);
  app.post("/getprintSetting", authenticateToken, tenantMiddleware, getprintSetting);
  app.post("/new-rights-print", authenticateToken, tenantMiddleware, newrightsprint);
};
