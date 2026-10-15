import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import callServiceMethod from "../../controllers/baseController.js";
import {
  getCartPaymentReport,
  getLinkableCarts,
  setAccountTransactionCartLink,
} from "../../services/activities/accountTransactionCartLinkServices.js";

export default (app) => {
  app.post(
    "/accountTransactionLinkableCarts",
    authenticateToken,
    tenantMiddleware,
    (req, res) => callServiceMethod(req, res, getLinkableCarts(req), "accountTransactionLinkableCarts")
  );
  app.post(
    "/accountTransactionSetCartLink",
    authenticateToken,
    tenantMiddleware,
    (req, res) => callServiceMethod(req, res, setAccountTransactionCartLink(req), "accountTransactionSetCartLink")
  );
  app.post(
    "/cartPaymentReport",
    authenticateToken,
    tenantMiddleware,
    (req, res) => callServiceMethod(req, res, getCartPaymentReport(req), "cartPaymentReport")
  );
};
