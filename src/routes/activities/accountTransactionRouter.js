import {
  accountTransactionsById,
  allAccountTransactions,
  allAccountTransactionsOnlineStore,
  allContactAccountTransactionPDF,
  createAccountTransactions,
  PDFaccountv1,
  updateAccountTransactions
} from "../../controllers/activities/accountTransactionController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post(
    "/accountTransactionList",
    authenticateToken,
    tenantMiddleware,
    allAccountTransactions
  );
  app.post(
    "/accountTransactionList/:contact_id",
    authenticateToken,
    tenantMiddleware,
    allAccountTransactions
  );
  app.post(
    "/account-transaction-list-online-store/:contact_id/:qr_code/:contactRequestData",
    allAccountTransactionsOnlineStore
  );
  app.post(
    "/accountTransactionById",
    authenticateToken,
    tenantMiddleware,
    accountTransactionsById
  );
  app.post(
    "/accountTransactionUpdate",
    authenticateToken,
    tenantMiddleware,
    updateAccountTransactions
  );
  app.post(
    "/accountTransactionCreate",
    authenticateToken,
    tenantMiddleware,
    createAccountTransactions
  );
  app.post(
    "/accountPDFv1",
    authenticateToken,
    tenantMiddleware,
    PDFaccountv1
  );
  app.post(
    "/ContactAllAccountTransactionPDF",
    authenticateToken,
    tenantMiddleware,
    allContactAccountTransactionPDF
  );
};
