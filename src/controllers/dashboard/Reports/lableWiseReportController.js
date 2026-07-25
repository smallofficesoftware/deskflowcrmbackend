import callServiceMethod from "../../baseController.js";
import {lableReport} from "../../../services/dashboard/Reports/lableWiseReportServices.js";

export const getLableReport = async (req, res) => {
  await callServiceMethod(req, res, lableReport(req), "lableReport");
};
