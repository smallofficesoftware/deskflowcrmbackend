import {
  accountTransactionsById,
  allAccountTransactions,
  allAccountTransactionsOnlineStore,
  allContactAccountTransactionPDF,
  createAccountTransactions,
  generateAccountTransactionSampleSheetProvider,
  getExcelSheetAccountTransactionProvider,
  PDFaccountv1,
  updateAccountTransactions
} from "../../controllers/activities/accountTransactionController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { uploadExcelSheet } from "../../middlewares/multer.js";
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
  app.post(
    "/generate-account-transaction-sample-sheet",
    authenticateToken,
    tenantMiddleware,
    generateAccountTransactionSampleSheetProvider
  );
  app.post(
    "/excel-sheet-account-transaction",
    authenticateToken,
    tenantMiddleware,
    uploadExcelSheet.single("file"),
    getExcelSheetAccountTransactionProvider
  );
};
