import { getAllPriceListMasters } from "../../services/product_settings/priceListMaster.js";
import callServiceMethod from "../baseController.js";



export const allPriceListMaster = async (req, res) => {
  await callServiceMethod(req, res, getAllPriceListMasters(req), "allPriceListMaster");
};