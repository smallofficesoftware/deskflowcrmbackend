import { getPriceListReport } from "../../services/product_settings/priceListReportServices.js";
import callServiceMethod from "../baseController.js";

export const getPriceListReportProvider = async (req, res) => {
    await callServiceMethod(req, res, getPriceListReport(req), "getPriceListReport");
};
