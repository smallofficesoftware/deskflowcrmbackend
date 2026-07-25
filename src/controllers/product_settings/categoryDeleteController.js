import { getCategoryDelete, getGroupDelete, getPaymentDelete, getTaskCategoryDelete, getWareHouseDelete } from "../../services/product_settings/categoryDeleteServices.js";
import callServiceMethod from "../baseController.js";

export const categoryDelete = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getCategoryDelete(req),
    "getCategoryDelete"
  );
};
export const taskcategoryDelete = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getTaskCategoryDelete(req),
    "getTaskCategoryDelete"
  );
};
export const warehouseDelete = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getWareHouseDelete(req),
    "getWareHouseDelete"
  );
};
export const groupDelete = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getGroupDelete(req),
    "getGroupDelete"
  );
};
export const paymentTypeDelete = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getPaymentDelete(req),
    "getGroupDelete"
  );
};
