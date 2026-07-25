import { getDailySalesInvoiceReport, getGstInOutReport, getTeamAllCarts, OrderDetailsProductIteamWise } from "../../../services/dashboard/Reports/teamAllCartsReportServices.js";
import callServiceMethod from "../../baseController.js";

export const teamAllCarts = async (req, res) => {
    await callServiceMethod(req, res, getTeamAllCarts(req), "getTeamAllCarts");
}
export const getdetailOrderReport = async (req, res) => {
    await callServiceMethod(req, res, OrderDetailsProductIteamWise(req), "getTeamAllCarts");
}
export const getDailySalesInvoice = async (req, res) => {
    await callServiceMethod(req, res, getDailySalesInvoiceReport(req), "getDailySalesInvoiceReport");
}
export const getGstInOut = async (req, res) => {
    await callServiceMethod(req, res, getGstInOutReport(req), "getGstInOutReport");
}