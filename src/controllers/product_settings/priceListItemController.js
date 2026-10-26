import {
  DeletePriceListAll,
  getAllPriceListItems,
  getExportsPriceListForUpdateData,
  insertPriceListCategoryWise
} from "../../services/product_settings/priceListItemService.js";
import { getQtySlabs, saveQtySlabs } from "../../services/product_settings/priceListQtySlabService.js";
import callServiceMethod from "../baseController.js";

export const allPriceListItem = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllPriceListItems(req),
    "allPriceListMaster"
  );
};
export const DeleteAllPrinceList = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    DeletePriceListAll(req),
    "DeleteAllPrinceList"
  );
};

export const addPriceListCategoryWise = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    insertPriceListCategoryWise(req),
    "addPriceListCategoryWise"
  );
};

export const exportsPriceListForUpdateData = async (req, res) => {
  await callServiceMethod(req, res, getExportsPriceListForUpdateData(req), "exportsPriceListForUpdateData");
};

export const getQtySlabsController = async (req, res) => {
  await callServiceMethod(req, res, getQtySlabs(req), "getQtySlabs");
};

export const saveQtySlabsController = async (req, res) => {
  await callServiceMethod(req, res, saveQtySlabs(req), "saveQtySlabs");
};
