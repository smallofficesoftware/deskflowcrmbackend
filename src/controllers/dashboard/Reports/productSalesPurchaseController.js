import callServiceMethod from "../../baseController.js";
import {getProductSalesPurchase} from "../../../services/dashboard/Reports/productSalesPurchaseServices.js"

export const productSalesPurchase = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getProductSalesPurchase(req),
    "getProductSalesPurchase"
  );
};
