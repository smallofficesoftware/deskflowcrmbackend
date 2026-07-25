import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import {
  expenseMainMasterCreate,
  expenseMainMasterGet,
  expenseMainMasterUpdate,
  expenseMasterCreate,
  expenseMasterUpdate,
  getAllExpenseMaster
} from "../../services/hr/expenseTypeMasterServices.js";
import callServiceMethod from "../baseController.js";


export const allExpenseTypeMaster = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllExpenseMaster(req),
    "allExpenseTypeMaster"
  );
};

export const createExpenseTypeMaster = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, expenseMasterCreate(req), "createProduct");
};
export const expenseTypeMasterUpdate = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, expenseMasterUpdate(req), "updateProduct");
};

export const createExpenseTypeMainMaster = async (req, res) => {
  await callServiceMethod(req, res, expenseMainMasterCreate(req), "createExpenseType");
};
export const updateExpenseTypeMainMaster = async (req, res) => {
  await callServiceMethod(req, res, expenseMainMasterUpdate(req), "updateExpenseType");
};
export const getExpenseTypeMainMaster = async (req, res) => {
  await callServiceMethod(req, res, expenseMainMasterGet(req), "getExpenseType");
};
