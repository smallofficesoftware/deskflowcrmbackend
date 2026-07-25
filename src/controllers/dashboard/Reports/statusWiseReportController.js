import callServiceMethod from "../../../controllers/baseController.js";
import { statusWiseReport } from "../../../services/dashboard/Reports/statusWiseReportServices.js";


export const getStatusReport = async (req, res) => {
    await callServiceMethod(req, res, statusWiseReport(req), "statusWiseReport");
};