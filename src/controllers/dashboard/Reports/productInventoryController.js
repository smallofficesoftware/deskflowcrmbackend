import callServiceMethod from "../../baseController.js";
import { productInventoryReport } from "../../../services/dashboard/Reports/productInventoryReportServices.js";

export const productInventory = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    productInventoryReport(req),
    "productInventoryReport"
  );
};
