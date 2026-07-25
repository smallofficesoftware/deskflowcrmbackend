import { allCustomFieldFrom, allCustomFieldFrombyQr, allgetCustomFieldDatavalueforQrByinquiry, createCustomFieldDatavalues, createCustomFieldFrom, getAllCustomFieldDatavalues } from "../../controllers/other_settings/customFieldFormController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/createCustomFieldFrom", authenticateToken, tenantMiddleware, createCustomFieldFrom);
  app.post("/getCustomFieldFrom", authenticateToken, tenantMiddleware, allCustomFieldFrom);
  app.post("/getCustomFormFiledbyQr", allCustomFieldFrombyQr);
  app.post("/getCustomFieldDatavalueforQrByinquiry", allgetCustomFieldDatavalueforQrByinquiry);

  app.post("/createCustomFieldDatavalues", authenticateToken, tenantMiddleware, createCustomFieldDatavalues);
  app.post("/getCustomFieldDatavalues", authenticateToken, tenantMiddleware, getAllCustomFieldDatavalues);

};
