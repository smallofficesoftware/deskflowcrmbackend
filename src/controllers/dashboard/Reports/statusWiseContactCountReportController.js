import { statusWiseContactCountReportGet } from "../../../services/dashboard/Reports/statusWiseContactCountReportServices.js";
import callServiceMethod from "../../baseController.js";

export const getStatusWiseContactCountReport = async (req, res) => {
    await callServiceMethod(req, res, statusWiseContactCountReportGet(req), "statusWiseContactCountReportGet");
};
