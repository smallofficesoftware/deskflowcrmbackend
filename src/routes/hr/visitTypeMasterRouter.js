import { allVisitTypeMaster, createVisitTypeMaster, visitTypeMasterUpdate } from "../../controllers/hr/visitTypeMasterController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { visitUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/get-visit", authenticateToken, tenantMiddleware, allVisitTypeMaster);
  app.post("/create-visit", authenticateToken, tenantMiddleware, visitUpload, createVisitTypeMaster);
  app.post("/update-visit", authenticateToken, tenantMiddleware, visitUpload, visitTypeMasterUpdate);

};
