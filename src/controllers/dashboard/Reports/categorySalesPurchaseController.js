import callServiceMethod from "../../baseController.js";
import {getCategorySalesPurchase} from "../../../services/dashboard/Reports/categorySalesPurchaseServices.js"

export const categorySalesPurchase = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getCategorySalesPurchase(req),
    "getCategorySalesPurchase"
  );
};
