import {
  DeletePriceListAll,
  getAllPriceListItems,
  getExportsPriceListForUpdateData,
  insertPriceListCategoryWise
} from "../../services/product_settings/priceListItemService.js";
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