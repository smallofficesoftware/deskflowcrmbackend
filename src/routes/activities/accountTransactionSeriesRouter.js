import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import callServiceMethod from "../../controllers/baseController.js";
import { getAccountTransactionSeriesPreview } from "../../services/activities/accountTransactionSeriesPreview.js";

export default (app) => {
  app.post(
    "/accountTransactionSeriesPreview",
    authenticateToken,
    tenantMiddleware,
    (req, res) => callServiceMethod(req, res, getAccountTransactionSeriesPreview(req), "accountTransactionSeriesPreview")
  );
};
