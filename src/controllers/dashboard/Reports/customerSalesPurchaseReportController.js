import { getCustomerSalesPurchaseReport } from "../../../services/dashboard/Reports/customerSalesPurchaseReportServices.js";
import callServiceMethod from "../../baseController.js";

export const customerSalesPurchaseReport = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getCustomerSalesPurchaseReport(req),
        "getCustomerSalesPurchaseReport"
    );
};
