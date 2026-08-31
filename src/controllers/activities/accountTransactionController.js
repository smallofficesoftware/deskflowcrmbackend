import {
  accountPDFv1,
  accountTransactionById,
  allAccountTransactionOfContactPDF,
  allAccountTransactionOfContactPDFOnlineStore,
  createAccountTransaction,
  generateAccountTransactionSampleSheet,
  getAllAccountTransactions,
  getAllAccountTransactionsForOnlineStore,
  importAccountTransactionByExcel,
  updateAccountTransaction
} from "../../services/activities/accountTransactionServices.js";
import callServiceMethod from "../baseController.js";

export const allAccountTransactions = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllAccountTransactions(req, res),
    "allAccountTransactions"
  );
};
export const allAccountTransactionsOnlineStore = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllAccountTransactionsForOnlineStore(req, res),
    "getAllAccountTransactionsForOnlineStore"
  );
};
export const accountTransactionsById = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    accountTransactionById(req),
    "allAccountTransactions"
  );
};
export const createAccountTransactions = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    createAccountTransaction(req),
    "updateAccountTransaction"
  );
};
export const updateAccountTransactions = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    updateAccountTransaction(req),
    "updateAccountTransaction"
  );
};

export const getContactAccountStatement = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAccountStatementOfContact(req),
    "getAccountStatementOfContact"
  );
};

export const PDFaccountv1 = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    accountPDFv1(req),
    "accountPDFv1"
  );
};

export const allContactAccountTransactionPDF = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    allAccountTransactionOfContactPDF(req),
    "allAccountTransactionOfContact"
  );
};

export const allContactAccountTransactionPDFOnlineStore = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    allAccountTransactionOfContactPDFOnlineStore(req),
    "allAccountTransactionOfContactPDFOnlineStore"
  );
};

export const generateAccountTransactionSampleSheetProvider = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    generateAccountTransactionSampleSheet(req, res),
    "generateAccountTransactionSampleSheetProvider"
  );
};

export const getExcelSheetAccountTransactionProvider = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    importAccountTransactionByExcel(req),
    "getExcelSheetAccountTransactionProvider"
  );
};
