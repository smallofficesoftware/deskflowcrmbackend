import callServiceMethod from "../../baseController.js";
import {sourceReport} from "../../../services/dashboard/Reports/sourceReportServices.js"

export const getSourceReport = async (req, res) => {
  await callServiceMethod(req, res, sourceReport(req), "getSourceReport");
};
