import { getAllContactChainWise } from "../../../services/dashboard/Reports/chainContactReportService.js";
import callServiceMethod from "../../baseController.js";

export const chainContactReport = async (req, res) => {
    await callServiceMethod(req, res, getAllContactChainWise(req), "getAllContactChainWise");
};